// src/shared/images/prepareItemRenditions.ts
// build the three TierItem renditions (preview / tile / source) from one image
// source via progressive downscale (one expensive resample instead of three)

import { canvasToBlob, drawImageToCanvas } from '~/shared/images/imageEncode'
import {
  persistPreparedBlobRecords,
  prepareBlobRecord,
  type PreparedBlobRecord,
} from '~/shared/images/imagePersistence'
import {
  BOARD_TILE_IMAGE_MIME_TYPE,
  BOARD_TILE_IMAGE_QUALITY,
  MAX_BOARD_TILE_IMAGE_SIZE,
  MAX_EDITOR_SOURCE_SIZE,
  MAX_THUMBNAIL_SIZE,
} from '~/shared/images/renditions'

interface PreparedRenditionRecords
{
  preview: PreparedBlobRecord
  tile: PreparedBlobRecord
  source: PreparedBlobRecord
  aspectRatio: number
}

interface PreparedRenditionOptions
{
  // override the preview max edge for higher-DPR icons; defaults to MAX_THUMBNAIL_SIZE
  previewMaxSize?: number
}

// build prepared rendition records ready for one IDB batch persist
export const buildItemRenditionRecords = async (
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  options: PreparedRenditionOptions = {}
): Promise<PreparedRenditionRecords> =>
{
  const previewMax = options.previewMaxSize ?? MAX_THUMBNAIL_SIZE

  // each canvas resamples from the previous (smaller) canvas instead of the
  // full-size source — drawImageToCanvas no-ops when already under a stage cap
  const sourceCanvas = drawImageToCanvas(
    source,
    naturalWidth,
    naturalHeight,
    MAX_EDITOR_SOURCE_SIZE
  )
  const tileCanvas = drawImageToCanvas(
    sourceCanvas,
    sourceCanvas.width,
    sourceCanvas.height,
    MAX_BOARD_TILE_IMAGE_SIZE
  )
  const previewCanvas = drawImageToCanvas(
    tileCanvas,
    tileCanvas.width,
    tileCanvas.height,
    previewMax
  )

  const [sourceBlob, tileBlob, previewBlob] = await Promise.all([
    canvasToBlob(sourceCanvas, { mimeType: 'image/png' }),
    canvasToBlob(tileCanvas, {
      mimeType: BOARD_TILE_IMAGE_MIME_TYPE,
      quality: BOARD_TILE_IMAGE_QUALITY,
    }),
    canvasToBlob(previewCanvas, { mimeType: 'image/png' }),
  ])

  const [source_, tile, preview] = await Promise.all([
    prepareBlobRecord(sourceBlob),
    prepareBlobRecord(tileBlob),
    prepareBlobRecord(previewBlob),
  ])

  return {
    preview,
    tile,
    source: source_,
    aspectRatio: naturalWidth / naturalHeight,
  }
}

// flatten prepared records to the TierItem image-ref triple
export const toItemImageRefs = ({
  preview,
  tile,
  source,
}: PreparedRenditionRecords) => ({
  imageRef: preview.imageRef,
  tileImageRef: tile.imageRef,
  sourceImageRef: source.imageRef,
})

// flatten prepared records to the persistable record list
export const collectRenditionRecords = ({
  preview,
  tile,
  source,
}: PreparedRenditionRecords): PreparedBlobRecord[] => [preview, tile, source]

// one-shot prepare-&-persist for a single source image; returns TierItem
// fields ready to merge into a NewTierItem
export const persistItemRenditions = async (
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  options?: PreparedRenditionOptions
): Promise<{
  imageRef: PreparedBlobRecord['imageRef']
  tileImageRef: PreparedBlobRecord['imageRef']
  sourceImageRef: PreparedBlobRecord['imageRef']
  aspectRatio: number
}> =>
{
  const records = await buildItemRenditionRecords(
    source,
    naturalWidth,
    naturalHeight,
    options
  )
  await persistPreparedBlobRecords(collectRenditionRecords(records))
  return {
    ...toItemImageRefs(records),
    aspectRatio: records.aspectRatio,
  }
}
