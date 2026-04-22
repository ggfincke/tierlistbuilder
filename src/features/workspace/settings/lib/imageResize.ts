// src/features/workspace/settings/lib/imageResize.ts
// image resize & upload utilities — shrinks uploads to thumbnail size before storage

import type { NewTierItem } from '@/features/workspace/boards/model/contract'
import { MAX_THUMBNAIL_SIZE } from './constants'
import { deriveLabelFromFilename, getResizedDimensions } from './imageGeometry'
import { loadImageElement } from './imageLoad'

export interface ResizedImage
{
  imageUrl: string
  // source image dimensions before downscaling, used to derive aspect ratio
  naturalWidth: number
  naturalHeight: number
}

export type ImportedImage = Required<
  Pick<NewTierItem, 'imageUrl' | 'label' | 'aspectRatio'>
>

// filter, resize, & collect image files — callers handle errors & store dispatch
export const processImageFiles = async (
  files: File[]
): Promise<ImportedImage[]> =>
{
  const images = files.filter((f) => f.type.startsWith('image/'))

  const results = await Promise.all(
    images.map(async (imageFile) =>
    {
      try
      {
        const { imageUrl, naturalWidth, naturalHeight } =
          await resizeImageFile(imageFile)
        return {
          imageUrl,
          label: deriveLabelFromFilename(imageFile.name),
          aspectRatio: naturalWidth / naturalHeight,
        }
      }
      catch
      {
        return null
      }
    })
  )

  return results.filter((item): item is ImportedImage => item !== null)
}

// load a File into an HTMLImageElement via object URL (fallback path when
// createImageBitmap isn't available); revokes the object URL on both success
// & failure to avoid leaks
const loadFileAsImage = async (file: File): Promise<HTMLImageElement> =>
{
  const objectUrl = URL.createObjectURL(file)
  try
  {
    return await loadImageElement({
      src: objectUrl,
      errorMessage: `Failed to load image: ${file.name}`,
    })
  }
  finally
  {
    URL.revokeObjectURL(objectUrl)
  }
}

// resize a File to a PNG data URL capped at maxSize px on the longest side
export const resizeImageFile = async (
  file: File,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<ResizedImage> =>
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
    const imageElement = await loadFileAsImage(file)
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
  return {
    imageUrl: canvas.toDataURL('image/png'),
    naturalWidth: sourceWidth,
    naturalHeight: sourceHeight,
  }
}
