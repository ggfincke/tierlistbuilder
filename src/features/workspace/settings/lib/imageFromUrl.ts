// src/features/workspace/settings/lib/imageFromUrl.ts
// fetch remote image, resize to thumbnail & persist to blob store.
// falls back to inline data URLs when local image storage is unavailable

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import { persistBlobSource } from '~/shared/images/imagePersistence'
import { MAX_THUMBNAIL_SIZE } from './constants'
import {
  canvasToPngBlob,
  deriveLabelFromFilename,
  getResizedDimensions,
} from './imageGeometry'

const LOAD_TIMEOUT = 15_000

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

// fetch a remote image, resize, persist to the blob store, & return a
// content-addressable reference + derived label
export const fetchImageAsItemImage = async (
  url: string,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<NewTierItem & { label: string }> =>
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

  const blob = await canvasToPngBlob(canvas)
  const source = await persistBlobSource(blob)

  return {
    ...source,
    label: labelFromUrl(url),
  }
}
