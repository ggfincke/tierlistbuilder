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

import {
  cacheFreshBlob,
  ensureCloudImageCached,
} from '~/shared/images/imageBlobCache'
import { getBlob, type BlobRecord } from '~/shared/images/imageStore'
import { mapAsyncLimit } from './asyncMapLimit'
import { logger } from './logger'

const AUTO_CROP_BATCH_CONCURRENCY = 4

const scanCache = new Map<string, AutoCropScan | null>()
const scanCacheListeners = new Set<() => void>()
let scanCacheVersion = 0

const emitScanCacheChange = (): void =>
{
  scanCacheVersion += 1
  for (const listener of scanCacheListeners) listener()
}

export const clearAutoCropCache = (): void =>
{
  scanCache.clear()
  emitScanCacheChange()
}

export const subscribeAutoCropCache = (listener: () => void): (() => void) =>
{
  scanCacheListeners.add(listener)
  return () => scanCacheListeners.delete(listener)
}

export const getAutoCropCacheVersion = (): number => scanCacheVersion

export const getAutoCropHash = (item: TierItem): string | undefined =>
  item.sourceImageRef?.hash ?? item.imageRef?.hash

const getAutoCropImageRef = (item: TierItem): TierItemImageRef | undefined =>
  item.sourceImageRef ?? item.imageRef

export const loadAutoCropBlob = async (
  ref: TierItemImageRef | undefined
): Promise<BlobRecord | null> =>
{
  if (!ref) return null

  let record = await getBlob(ref.hash)
  if (!record && ref.cloudMediaExternalId)
  {
    await ensureCloudImageCached(ref.hash, ref.cloudMediaExternalId)
    record = await getBlob(ref.hash)
  }
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
  let hasDetectedCrop = false
  for (const item of items)
  {
    const hash = getAutoCropHash(item)
    if (!hash) continue
    const bbox = getCachedBBox(hash, trimSoftShadows)
    if (bbox === undefined) return false
    if (bbox === null) continue
    hasDetectedCrop = true
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
  return hasDetectedCrop
}

// detect content bbox; returns null when detection fails or only finds a tiny
// false-positive region. cached by hash so toggling the trim-shadows option
// or repeat calls skip the decode/scan
export const detectContentBBox = async (
  blob: Blob,
  hash: string | undefined,
  trimSoftShadows: boolean
): Promise<AutoCropBBox | null> =>
{
  if (hash && scanCache.has(hash))
  {
    const cached = scanCache.get(hash)
    return cached ? pickAutoCropBBox(cached, trimSoftShadows) : null
  }

  let scan: AutoCropScan | null = null
  try
  {
    scan = await runScan(blob)
  }
  catch (error)
  {
    logger.warn('autoCrop', 'detection failed', error)
    scan = null
  }

  if (hash)
  {
    scanCache.set(hash, scan)
    emitScanCacheChange()
  }
  return scan ? pickAutoCropBBox(scan, trimSoftShadows) : null
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

interface AutoCropTransformEntry
{
  id: ItemId
  transform: ItemTransform
}

interface CollectAutoCropTransformsParams
{
  // pre-filtered to items w/ a valid auto-crop hash
  targets: readonly TierItem[]
  boardAspectRatio: number
  trimSoftShadows: boolean
  onProgress?: () => void
}

// shared bulk auto-crop pipeline used by the issue modal & image editor:
// decode-or-cache hit per target, scan, resolve transform, return only the
// items that produced detected content. caller drives progress UI & commits
export const collectAutoCropTransforms = async ({
  targets,
  boardAspectRatio,
  trimSoftShadows,
  onProgress,
}: CollectAutoCropTransformsParams): Promise<AutoCropTransformEntry[]> =>
{
  const entries = await mapAsyncLimit(
    targets,
    AUTO_CROP_BATCH_CONCURRENCY,
    async (item): Promise<AutoCropTransformEntry | null> =>
    {
      const ref = getAutoCropImageRef(item)!
      const hash = ref.hash
      let bbox = getCachedBBox(hash, trimSoftShadows)
      if (bbox === undefined)
      {
        const record = await loadAutoCropBlob(ref)
        bbox = record
          ? await detectContentBBox(record.bytes, hash, trimSoftShadows)
          : null
      }
      onProgress?.()
      if (!bbox) return null
      return {
        id: item.id,
        transform: resolveAutoCropTransform(item, bbox, boardAspectRatio),
      }
    }
  )
  return entries.filter(
    (entry): entry is AutoCropTransformEntry => entry !== null
  )
}

const runScan = async (blob: Blob): Promise<AutoCropScan | null> =>
{
  const bitmap = await createImageBitmap(blob)
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
