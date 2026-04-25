// src/features/workspace/settings/lib/imageResize.ts
// image resize & upload utilities for display thumbs + editor source blobs

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  BLOB_PREPARE_CONCURRENCY,
  persistPreparedBlobRecords,
  prepareBlobRecord,
} from '~/shared/images/imagePersistence'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { MAX_EDITOR_SOURCE_SIZE, MAX_THUMBNAIL_SIZE } from './constants'
import { deriveLabelFromFilename, drawImageToPngBlob } from './imageGeometry'

// processed upload result w/ partial-failure accounting
export interface ProcessImageFilesResult
{
  items: Array<NewTierItem & { label: string }>
  failedCount: number
}

// intermediate blobs + label + source aspect ratio captured during resize
interface PreparedImage
{
  displayBlob: Blob
  sourceBlob: Blob
  label: string
  aspectRatio: number
}

// filter, resize, persist, & collect image files
export const processImageFiles = async (
  files: File[]
): Promise<ProcessImageFilesResult> =>
{
  const images = files.filter((f) => f.type.startsWith('image/'))
  const resized = await Promise.all(
    images.map(async (imageFile) =>
    {
      try
      {
        const { displayBlob, sourceBlob, naturalWidth, naturalHeight } =
          await resizeImageFileToBlobs(imageFile)
        return {
          displayBlob,
          sourceBlob,
          label: deriveLabelFromFilename(imageFile.name),
          aspectRatio: naturalWidth / naturalHeight,
        } satisfies PreparedImage
      }
      catch
      {
        return null
      }
    })
  )

  const preparedItems = resized.filter(
    (item): item is PreparedImage => item !== null
  )
  const preparedSources = await mapAsyncLimit(
    preparedItems,
    BLOB_PREPARE_CONCURRENCY,
    async (item) => ({
      item,
      display: await prepareBlobRecord(item.displayBlob),
      source: await prepareBlobRecord(item.sourceBlob),
    })
  )
  await persistPreparedBlobRecords(
    preparedSources.flatMap((entry) => [entry.display, entry.source])
  )
  const items = preparedSources.map(({ item, display, source }) => ({
    imageRef: display.imageRef,
    sourceImageRef: source.imageRef,
    label: item.label,
    aspectRatio: item.aspectRatio,
  })) satisfies Array<NewTierItem & { label: string }>

  return {
    items,
    failedCount: images.length - items.length,
  }
}

interface ResizedBlob
{
  displayBlob: Blob
  sourceBlob: Blob
  // source image dimensions before downscaling, used to derive aspect ratio
  naturalWidth: number
  naturalHeight: number
}

// resize a File into display & editor PNG blobs while preserving source ratio
const resizeImageFileToBlobs = async (file: File): Promise<ResizedBlob> =>
{
  const imageBitmap = await createImageBitmap(file)
  const naturalWidth = imageBitmap.width
  const naturalHeight = imageBitmap.height

  try
  {
    const [displayBlob, sourceBlob] = await Promise.all([
      drawImageToPngBlob(
        imageBitmap,
        naturalWidth,
        naturalHeight,
        MAX_THUMBNAIL_SIZE
      ),
      drawImageToPngBlob(
        imageBitmap,
        naturalWidth,
        naturalHeight,
        MAX_EDITOR_SOURCE_SIZE
      ),
    ])

    return { displayBlob, sourceBlob, naturalWidth, naturalHeight }
  }
  finally
  {
    imageBitmap.close()
  }
}
