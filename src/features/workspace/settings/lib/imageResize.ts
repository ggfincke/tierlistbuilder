// src/features/workspace/settings/lib/imageResize.ts
// image resize & upload utilities — shrinks uploads to thumbnail size before storage

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import { persistBlobSources } from '~/shared/images/imagePersistence'
import { MAX_THUMBNAIL_SIZE } from './constants'
import {
  canvasToPngBlob,
  deriveLabelFromFilename,
  getResizedDimensions,
} from './imageGeometry'

// processed upload result w/ partial-failure accounting
export interface ProcessImageFilesResult
{
  items: Array<NewTierItem & { label: string }>
  failedCount: number
}

// intermediate blob + label + natural dimensions captured during resize.
// aspect ratio is computed once so the persist step can thread it into the
// returned NewTierItem alongside the blob-store imageRef
interface PreparedImage
{
  blob: Blob
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
        const { blob, naturalWidth, naturalHeight } =
          await resizeImageFileToBlob(imageFile)
        return {
          blob,
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
  const sources = await persistBlobSources(
    preparedItems.map((item) => item.blob)
  )
  const items = sources.map((source, index) => ({
    ...source,
    label: preparedItems[index].label,
    aspectRatio: preparedItems[index].aspectRatio,
  })) satisfies Array<NewTierItem & { label: string }>

  return {
    items,
    failedCount: images.length - items.length,
  }
}

interface ResizedBlob
{
  blob: Blob
  // source image dimensions before downscaling, used to derive aspect ratio
  naturalWidth: number
  naturalHeight: number
}

// resize a File to a PNG Blob capped at maxSize px on the longest side.
// returns raw bytes + source dimensions so the caller can hash & persist the
// blob to the IndexedDB image store while still capturing the original ratio
const resizeImageFileToBlob = async (
  file: File,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<ResizedBlob> =>
{
  const imageBitmap = await createImageBitmap(file)
  const naturalWidth = imageBitmap.width
  const naturalHeight = imageBitmap.height

  const { width, height } = getResizedDimensions(
    naturalWidth,
    naturalHeight,
    maxSize
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context)
  {
    imageBitmap.close()
    throw new Error('Could not initialize a canvas context.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(imageBitmap, 0, 0, width, height)

  imageBitmap.close()

  const blob = await canvasToPngBlob(canvas)
  return { blob, naturalWidth, naturalHeight }
}
