// src/shared/lib/auto-crop/pipeline.ts
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
import { isSameItemTransform } from '@tierlistbuilder/contracts/workspace/imageTransform'
import {
  AUTO_CROP_ANALYSIS_MAX_SIZE,
  bboxToItemTransform,
  getAutoCropAnalysisDimensions,
  pickAutoCropBBox,
  scanAutoCropPixels,
  type AutoCropBBox,
  type AutoCropScan,
} from '@tierlistbuilder/contracts/workspace/autoCrop'

import { cacheFreshBlob } from '~/shared/images/imageBlobCache'
import { getBlob, type BlobRecord } from '~/shared/images/imageBlobStore'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { isAbortError } from '~/shared/lib/errors'
import { getPrimaryImageRef } from '~/shared/lib/imageRefs'
import { logger } from '~/shared/lib/logger'
import { withTimeout } from '~/shared/lib/promise'
import { withImageBitmap } from '~/shared/images/imageBitmap'
import { createScanCache } from '~/shared/lib/auto-crop/scanCache'

const AUTO_CROP_BATCH_CONCURRENCY = 4
const AUTO_CROP_DECODE_TIMEOUT_MS = 5_000
const AUTO_CROP_ITEM_TIMEOUT_MS = 8_000
const MAX_SCAN_CACHE_ENTRIES = 512

export { bboxToItemTransform }

const scanCache = createScanCache<string>(MAX_SCAN_CACHE_ENTRIES)
const scanCacheListeners = new Set<() => void>()
let scanCacheVersion = 0

const createAbortError = (message: string): DOMException =>
  new DOMException(message, 'AbortError')

const emitScanCacheChange = (): void =>
{
  scanCacheVersion += 1
  for (const listener of scanCacheListeners) listener()
}

const rememberScan = (hash: string, scan: AutoCropScan | null): void =>
{
  scanCache.remember(hash, scan)
}

const readCachedScan = (hash: string): AutoCropScan | null | undefined =>
  scanCache.read(hash)

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
  const record = await getBlob(ref.hash, { signal })
  signal?.throwIfAborted()
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
  const scan = readCachedScan(hash)
  if (scan === undefined) return undefined
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

export const isCachedAutoCropApplied = (
  item: TierItem,
  boardAspectRatio: number,
  trimSoftShadows: boolean
): boolean | undefined =>
{
  const hash = getAutoCropImageRef(item)?.hash
  if (!hash) return undefined
  const bbox = getCachedBBox(hash, trimSoftShadows)
  if (bbox === undefined) return undefined
  if (bbox === null)
  {
    return isSameItemTransform(
      item.transform ?? ITEM_TRANSFORM_IDENTITY,
      ITEM_TRANSFORM_IDENTITY
    )
  }
  return isSameItemTransform(
    item.transform ?? ITEM_TRANSFORM_IDENTITY,
    resolveAutoCropTransform(item, bbox, boardAspectRatio)
  )
}

// label-aware cropping can target a different effective AR per item
export const areCachedAutoCropsApplied = (
  items: readonly TierItem[],
  getBoardAspectRatio: (item: TierItem) => number,
  trimSoftShadows: boolean
): boolean =>
{
  let hasResolvedTarget = false
  for (const item of items)
  {
    const applied = isCachedAutoCropApplied(
      item,
      getBoardAspectRatio(item),
      trimSoftShadows
    )
    if (applied === undefined)
    {
      if (!getAutoCropImageRef(item)?.hash) continue
      return false
    }
    hasResolvedTarget = true
    if (!applied) return false
  }
  return hasResolvedTarget
}

interface AutoCropDetectionResult
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
  const cachedScan = hash ? readCachedScan(hash) : undefined
  if (cachedScan !== undefined)
  {
    return {
      bbox: cachedScan ? pickAutoCropBBox(cachedScan, trimSoftShadows) : null,
      scanned: true,
    }
  }

  let scan: AutoCropScan | null = null
  let cacheable = true
  try
  {
    scan = await runScan(blob, signal)
  }
  catch (error)
  {
    if (isAbortError(error)) throw error
    logger.warn('autoCrop', 'detection failed', error)
    cacheable = false
    scan = null
  }
  signal?.throwIfAborted()

  if (hash && cacheable)
  {
    rememberScan(hash, scan)
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
  // label-aware cropping can resolve different effective ARs per item
  getBoardAspectRatio: (item: TierItem) => number
  trimSoftShadows: boolean
  onProgress?: () => void
  signal?: AbortSignal
}

const collectAutoCropTransformForItem = async (
  item: TierItem,
  getBoardAspectRatio: (item: TierItem) => number,
  trimSoftShadows: boolean,
  signal?: AbortSignal
): Promise<AutoCropTransformEntry | null> =>
{
  signal?.throwIfAborted()
  const ref = getAutoCropImageRef(item)!
  const hash = ref.hash
  if (!hash) return null

  let bbox = getCachedBBox(hash, trimSoftShadows)
  let scanned = bbox !== undefined
  if (bbox === undefined)
  {
    const record = await loadAutoCropBlob(ref, signal)
    if (!record) return null
    const result = await detectContentBBox(
      record.bytes,
      hash,
      trimSoftShadows,
      signal
    )
    bbox = result.bbox
    scanned = result.scanned
  }
  if (!bbox && !scanned) return null
  signal?.throwIfAborted()
  return {
    id: item.id,
    transform: bbox
      ? resolveAutoCropTransform(item, bbox, getBoardAspectRatio(item))
      : null,
  }
}

// shared bulk auto-crop pipeline used by the issue modal & image editor:
// decode/cache per target, then return crop transforms or null resets for
// images where scanning succeeded but no crop signal exists
export const collectAutoCropTransforms = async ({
  targets,
  getBoardAspectRatio,
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
      let itemTimedOut = false
      const itemController = new AbortController()
      const abortItemFromParent = (): void =>
        itemController.abort(
          signal?.reason ?? createAbortError('Auto-crop batch aborted.')
        )
      if (signal)
      {
        if (signal.aborted) abortItemFromParent()
        else
          signal.addEventListener('abort', abortItemFromParent, { once: true })
      }
      try
      {
        const entry = await withTimeout(
          collectAutoCropTransformForItem(
            item,
            getBoardAspectRatio,
            trimSoftShadows,
            itemController.signal
          ),
          AUTO_CROP_ITEM_TIMEOUT_MS,
          {
            mode: 'resolveNull',
            onTimeout: () =>
            {
              itemTimedOut = true
              itemController.abort(
                createAbortError('Auto-crop target timed out.')
              )
            },
          }
        )
        if (!entry)
        {
          logger.warn('autoCrop', 'target skipped or timed out', {
            itemId: item.id,
          })
        }
        return entry
      }
      catch (error)
      {
        if (itemTimedOut && isAbortError(error))
        {
          logger.warn('autoCrop', 'target skipped or timed out', {
            itemId: item.id,
          })
          return null
        }
        if (isAbortError(error)) throw error
        logger.warn('autoCrop', 'target failed', { itemId: item.id, error })
        return null
      }
      finally
      {
        if (signal) signal.removeEventListener('abort', abortItemFromParent)
        onProgress?.()
      }
    }
  )
  return entries.filter(
    (entry): entry is AutoCropTransformEntry => entry !== null
  )
}

// exposed so callers w/o a TierItem hash (cover image editor) can reuse the
// same decode+canvas+scan pipeline w/o duplicating the ImageBitmap timeout
export const scanBlobForAutoCrop = (blob: Blob): Promise<AutoCropScan | null> =>
  runScan(blob)

const runScan = async (
  blob: Blob,
  signal?: AbortSignal
): Promise<AutoCropScan | null> =>
{
  signal?.throwIfAborted()
  return withImageBitmap(
    blob,
    (bitmap) =>
    {
      signal?.throwIfAborted()
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
      signal?.throwIfAborted()
      const imageData = ctx.getImageData(0, 0, targetW, targetH)
      signal?.throwIfAborted()
      return scanAutoCropPixels({
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
      })
    },
    {
      signal,
      timeoutMs: AUTO_CROP_DECODE_TIMEOUT_MS,
      timeoutMessage: 'auto-crop decode timed out',
    }
  )
}
