// src/utils/imageFromUrl.ts
// fetch a remote image by URL, resize to thumbnail, & return as a data URL

import { MAX_THUMBNAIL_SIZE } from './constants'

// timeout for image loading (ms)
const LOAD_TIMEOUT = 15_000

// derive a display label from a URL by extracting the filename w/o extension
const labelFromUrl = (url: string): string =>
{
  try
  {
    const path = new URL(url).pathname
    const filename = path.split('/').pop() ?? ''
    const label = filename
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
    return label || 'Image'
  }
  catch
  {
    return 'Image'
  }
}

// compute output dimensions that fit within maxSize while preserving aspect ratio
const getResizedDimensions = (
  width: number,
  height: number,
  maxSize: number
) =>
{
  if (width <= maxSize && height <= maxSize)
  {
    return { width, height }
  }

  if (width >= height)
  {
    return {
      width: maxSize,
      height: Math.max(1, Math.round((height / width) * maxSize)),
    }
  }

  return {
    width: Math.max(1, Math.round((width / height) * maxSize)),
    height: maxSize,
  }
}

// load a remote image via <img> element w/ CORS & timeout
const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) =>
  {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    const timer = setTimeout(() =>
    {
      img.src = ''
      reject(new Error('Image load timed out.'))
    }, LOAD_TIMEOUT)

    img.onload = () =>
    {
      clearTimeout(timer)
      resolve(img)
    }

    img.onerror = () =>
    {
      clearTimeout(timer)
      reject(
        new Error(
          'Failed to load image. The server may block cross-origin requests.'
        )
      )
    }

    img.src = url
  })

// fetch a remote image, resize, & return as a data URL w/ derived label
export const fetchImageAsDataUrl = async (
  url: string,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<{ imageUrl: string; label: string }> =>
{
  const img = await loadImage(url)

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
  }
}
