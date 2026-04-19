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
        const blob = await resizeImageFileToBlob(imageFile)
        return {
          blob,
          label: deriveLabelFromFilename(imageFile.name),
        }
      }
      catch
      {
        return null
      }
    })
  )

  const preparedItems = resized.filter(
    (item): item is { blob: Blob; label: string } => item !== null
  )
  const sources = await persistBlobSources(
    preparedItems.map((item) => item.blob)
  )
  const items = sources.map((source, index) => ({
    ...source,
    label: preparedItems[index].label,
  })) satisfies Array<NewTierItem & { label: string }>

  return {
    items,
    failedCount: images.length - items.length,
  }
}

// resize a File to a PNG Blob capped at maxSize px on the longest side.
// returns raw bytes instead of a data URL so the caller can hash & persist
// directly to the IndexedDB image store w/o an intermediate base64 decode
const resizeImageFileToBlob = async (
  file: File,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<Blob> =>
{
  const imageBitmap = await createImageBitmap(file)

  const { width, height } = getResizedDimensions(
    imageBitmap.width,
    imageBitmap.height,
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

  return canvasToPngBlob(canvas)
}
