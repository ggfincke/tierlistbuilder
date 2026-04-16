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
    preparedItems.map((item) => item.blob),
    { fallbackToDataUrl: true }
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

// load a File into an HTMLImageElement via object URL (fallback path)
const loadImageElement = (file: File): Promise<HTMLImageElement> =>
{
  return new Promise((resolve, reject) =>
  {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    // revoke the object URL & resolve once the image is decoded
    image.onload = () =>
    {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    // revoke the object URL & reject on decode failure
    image.onerror = () =>
    {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Failed to load image: ${file.name}`))
    }

    image.src = objectUrl
  })
}

// resize a File to a PNG Blob capped at maxSize px on the longest side.
// returns raw bytes instead of a data URL so the caller can hash & persist
// directly to the IndexedDB image store w/o an intermediate base64 decode
const resizeImageFileToBlob = async (
  file: File,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<Blob> =>
{
  let imageBitmap: ImageBitmap | null = null
  let source: CanvasImageSource
  let sourceWidth: number
  let sourceHeight: number

  // prefer createImageBitmap for performance; fall back to <img> element
  if ('createImageBitmap' in window)
  {
    imageBitmap = await createImageBitmap(file)
    source = imageBitmap
    sourceWidth = imageBitmap.width
    sourceHeight = imageBitmap.height
  }
  else
  {
    const imageElement = await loadImageElement(file)
    source = imageElement
    sourceWidth = imageElement.naturalWidth
    sourceHeight = imageElement.naturalHeight
  }

  // calculate target canvas dimensions
  const { width, height } = getResizedDimensions(
    sourceWidth,
    sourceHeight,
    maxSize
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context)
  {
    imageBitmap?.close()
    throw new Error('Could not initialize a canvas context.')
  }

  // enable high-quality downscaling
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)

  // free the bitmap memory before encoding
  imageBitmap?.close()

  return canvasToPngBlob(canvas)
}
