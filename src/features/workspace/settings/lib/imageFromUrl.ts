// src/features/workspace/settings/lib/imageFromUrl.ts
// fetch a remote image by URL, resize to thumbnail, & return as a data URL

import type { NewTierItem } from '@/features/workspace/boards/model/contract'
import { MAX_THUMBNAIL_SIZE } from './constants'
import { deriveLabelFromFilename, getResizedDimensions } from './imageGeometry'
import { decodeImageAspectRatioFromSrc, loadImageElement } from './imageLoad'

// derive a display label from a URL by extracting the filename w/o extension
const labelFromUrl = (url: string): string =>
{
  try
  {
    const path = new URL(url).pathname
    const filename = path.split('/').pop() ?? ''
    return deriveLabelFromFilename(filename)
  }
  catch
  {
    return 'Image'
  }
}

export type FetchedImage = Required<
  Pick<NewTierItem, 'imageUrl' | 'label' | 'aspectRatio'>
>

// fetch a remote image, resize, & return as a data URL w/ derived label
export const fetchImageAsDataUrl = async (
  url: string,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<FetchedImage> =>
{
  const img = await loadImageElement({
    src: url,
    crossOrigin: 'anonymous',
    errorMessage:
      'Failed to load image. The server may block cross-origin requests.',
  })

  const { width, height } = getResizedDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxSize
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx)
  {
    throw new Error('Could not initialize a canvas context.')
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  return {
    imageUrl: canvas.toDataURL('image/png'),
    label: labelFromUrl(url),
    aspectRatio: img.naturalWidth / img.naturalHeight,
  }
}

// re-export so localBoardSession imports a single settings-layer helper rather
// than reaching into another feature's data layer for image decode
export { decodeImageAspectRatioFromSrc }
