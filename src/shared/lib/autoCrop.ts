// src/shared/lib/autoCrop.ts
// browser-side auto-crop pipeline: decode w/ createImageBitmap + canvas, then
// hand pixels to shared math. cache, hook integration, & blob loading stay here

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ItemRotation,
  ItemTransform,
  TierItemImageRef,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { ITEM_TRANSFORM_IDENTITY } from '@tierlistbuilder/contracts/workspace/board'
import {
  AUTO_CROP_ANALYSIS_MAX_SIZE,
  bboxToItemTransform,
  getAutoCropAnalysisDimensions,
  isSameItemTransform,
  pickAutoCropBBox,
  scanAutoCropPixels,
  type AutoCropBBox,
  type AutoCropScan,
} from '@tierlistbuilder/contracts/workspace/imageMath'

import { cacheFreshBlob } from '~/shared/images/imageBlobCache'
import { getBlob, type BlobRecord } from '~/shared/images/imageStore'
import { mapAsyncLimit } from './asyncMapLimit'
import { getPrimaryImageRef } from './imageRefs'
import { logger } from './logger'

const AUTO_CROP_BATCH_CONCURRENCY = 4
const AUTO_CROP_DECODE_TIMEOUT_MS = 5_000

export { bboxToItemTransform }

const scanCache = new Map<string, AutoCropScan | null>()
const scanCacheListeners = new Set<() => void>()
let scanCacheVersion = 0

const emitScanCacheChange = (): void =>
{
  scanCacheVersion += 1
  for (const listener of scanCacheListeners) listener()
}

export const subscribeAutoCropCache = (listener: () => void): (() => void) =>
{
  scanCacheListeners.add(listener)
  return () => scanCacheListeners.delete(listener)
}

export const getAutoCropCacheVersion = (): number => scanCacheVersion

export const getAutoCropImageRef = (
  item: TierItem
): TierItemImageRef | undefined => getPrimaryImageRef(item, 'editor')

export const loadAutoCropBlob = async (
  ref: TierItemImageRef | undefined,
  signal?: AbortSignal
): Promise<BlobRecord | null> =>
{
  if (!ref?.hash) return null

  signal?.throwIfAborted()
  const record = await getBlob(ref.hash)
  if (record)
  {
    cacheFreshBlob(ref.hash, record.bytes)
  }
  return record
}

export const getCachedBBox = (
  hash: string | undefined,
  trimSoftShadows: boolean
): AutoCropBBox | null | undefined =>
{
  if (!hash) return undefined
  if (!scanCache.has(hash)) return undefined
  const scan = scanCache.get(hash)
  return scan ? pickAutoCropBBox(scan, trimSoftShadows) : null
}

export const resolveAutoCropTransform = (
  item: TierItem,
  bbox: AutoCropBBox,
  boardAspectRatio: number,
  rotation: ItemRotation = item.transform?.rotation ?? 0
): ItemTransform =>
  bboxToItemTransform(bbox, {
    imageAspectRatio: item.aspectRatio,
    boardAspectRatio,
    rotation,
  })

export const areCachedAutoCropsApplied = (
  items: readonly TierItem[],
  boardAspectRatio: number,
  trimSoftShadows: boolean
): boolean =>
{
  let hasResolvedTarget = false
  for (const item of items)
  {
    const hash = getAutoCropImageRef(item)?.hash
    if (!hash) continue
    const bbox = getCachedBBox(hash, trimSoftShadows)
    if (bbox === undefined) return false
    hasResolvedTarget = true
    if (bbox === null)
    {
      if (
        !isSameItemTransform(
          item.transform ?? ITEM_TRANSFORM_IDENTITY,
          ITEM_TRANSFORM_IDENTITY
        )
      )
      {
        return false
      }
      continue
    }
    if (
      !isSameItemTransform(
        item.transform ?? ITEM_TRANSFORM_IDENTITY,
        resolveAutoCropTransform(item, bbox, boardAspectRatio)
      )
    )
    {
      return false
    }
  }
  return hasResolvedTarget
}

export interface AutoCropDetectionResult
{
  bbox: AutoCropBBox | null
  scanned: boolean
}

// detect content bbox; scanned=false only when decode/scan failed. cache scan
// success by hash, including null bboxes, so retries skip decode work
export const detectContentBBox = async (
  blob: Blob,
  hash: string | undefined,
  trimSoftShadows: boolean,
  signal?: AbortSignal
): Promise<AutoCropDetectionResult> =>
{
  signal?.throwIfAborted()
  if (hash && scanCache.has(hash))
  {
    const cached = scanCache.get(hash)
    return {
      bbox: cached ? pickAutoCropBBox(cached, trimSoftShadows) : null,
      scanned: true,
    }
  }

  let scan: AutoCropScan | null = null
  let cacheable = true
  try
  {
    scan = await runScan(blob)
  }
  catch (error)
  {
    logger.warn('autoCrop', 'detection failed', error)
    cacheable = false
    scan = null
  }
  signal?.throwIfAborted()

  if (hash && cacheable)
  {
    scanCache.set(hash, scan)
    emitScanCacheChange()
  }
  return {
    bbox: scan ? pickAutoCropBBox(scan, trimSoftShadows) : null,
    scanned: cacheable,
  }
}

// exposed for unit tests that synthesize ImageData directly to verify
// trim-shadows behavior without a real blob/decode round-trip
export const detectContentBBoxFromImageData = (
  imageData: ImageData,
  trimSoftShadows = true
): AutoCropBBox | null =>
{
  const scan = scanAutoCropPixels({
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  })
  return scan ? pickAutoCropBBox(scan, trimSoftShadows) : null
}

export interface AutoCropTransformEntry
{
  id: ItemId
  transform: ItemTransform | null
}

interface CollectAutoCropTransformsParams
{
  // pre-filtered to items w/ a valid auto-crop hash
  targets: readonly TierItem[]
  boardAspectRatio: number
  trimSoftShadows: boolean
  onProgress?: () => void
  signal?: AbortSignal
}

// shared bulk auto-crop pipeline used by the issue modal & image editor:
// decode/cache per target, then return crop transforms or null resets for
// images where scanning succeeded but no crop signal exists
export const collectAutoCropTransforms = async ({
  targets,
  boardAspectRatio,
  trimSoftShadows,
  onProgress,
  signal,
}: CollectAutoCropTransformsParams): Promise<AutoCropTransformEntry[]> =>
{
  const entries = await mapAsyncLimit(
    targets,
    AUTO_CROP_BATCH_CONCURRENCY,
    async (item): Promise<AutoCropTransformEntry | null> =>
    {
      signal?.throwIfAborted()
      const ref = getAutoCropImageRef(item)!
      const hash = ref.hash
      if (!hash)
      {
        onProgress?.()
        return null
      }
      let bbox = getCachedBBox(hash, trimSoftShadows)
      let scanned = bbox !== undefined
      if (bbox === undefined)
      {
        const record = await loadAutoCropBlob(ref, signal)
        if (!record)
        {
          onProgress?.()
          return null
        }
        const result = await detectContentBBox(
          record.bytes,
          hash,
          trimSoftShadows,
          signal
        )
        bbox = result.bbox
        scanned = result.scanned
      }
      onProgress?.()
      if (!bbox && !scanned) return null
      return {
        id: item.id,
        transform: bbox
          ? resolveAutoCropTransform(item, bbox, boardAspectRatio)
          : null,
      }
    }
  )
  return entries.filter(
    (entry): entry is AutoCropTransformEntry => entry !== null
  )
}

const decodeImageBitmap = async (blob: Blob): Promise<ImageBitmap> =>
{
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try
  {
    return await Promise.race([
      createImageBitmap(blob),
      new Promise<ImageBitmap>((_, reject) =>
      {
        timeoutId = setTimeout(
          () => reject(new Error('auto-crop decode timed out')),
          AUTO_CROP_DECODE_TIMEOUT_MS
        )
      }),
    ])
  }
  finally
  {
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
}

// exposed so callers w/o a TierItem hash (cover image editor) can reuse the
// same decode+canvas+scan pipeline w/o duplicating the ImageBitmap timeout
export const scanBlobForAutoCrop = (blob: Blob): Promise<AutoCropScan | null> =>
  runScan(blob)

const runScan = async (blob: Blob): Promise<AutoCropScan | null> =>
{
  const bitmap = await decodeImageBitmap(blob)
  try
  {
    const { width: targetW, height: targetH } = getAutoCropAnalysisDimensions(
      bitmap.width,
      bitmap.height,
      AUTO_CROP_ANALYSIS_MAX_SIZE
    )
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    const imageData = ctx.getImageData(0, 0, targetW, targetH)
    return scanAutoCropPixels({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }
  finally
  {
    // free decoded bitmap immediately; createImageBitmap retains GPU memory
    bitmap.close()
  }
}
