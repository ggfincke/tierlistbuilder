// src/utils/imageResize.ts
// image resize utility — shrinks uploads to thumbnail size before storage
import { MAX_THUMBNAIL_SIZE } from './constants'

// load a File into an HTMLImageElement via object URL (fallback path)
const loadImageElement = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    // revoke the object URL & resolve once the image is decoded
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    // revoke the object URL & reject on decode failure
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Failed to load image: ${file.name}`))
    }

    image.src = objectUrl
  })
}

// compute output dimensions that fit within maxSize while preserving aspect ratio
const getResizedDimensions = (width: number, height: number, maxSize: number) => {
  // image already fits — return original dimensions unchanged
  if (width <= maxSize && height <= maxSize) {
    return { width, height }
  }

  // landscape or square — constrain by width
  if (width >= height) {
    return {
      width: maxSize,
      height: Math.max(1, Math.round((height / width) * maxSize)),
    }
  }

  // portrait — constrain by height
  return {
    width: Math.max(1, Math.round((width / height) * maxSize)),
    height: maxSize,
  }
}

// resize a File to a PNG data URL capped at maxSize px on the longest side
export const resizeImageFile = async (
  file: File,
  maxSize = MAX_THUMBNAIL_SIZE,
): Promise<string> => {
  let imageBitmap: ImageBitmap | null = null
  let source: CanvasImageSource
  let sourceWidth: number
  let sourceHeight: number

  // prefer createImageBitmap for performance; fall back to <img> element
  if ('createImageBitmap' in window) {
    imageBitmap = await createImageBitmap(file)
    source = imageBitmap
    sourceWidth = imageBitmap.width
    sourceHeight = imageBitmap.height
  } else {
    const imageElement = await loadImageElement(file)
    source = imageElement
    sourceWidth = imageElement.naturalWidth
    sourceHeight = imageElement.naturalHeight
  }

  // calculate target canvas dimensions
  const { width, height } = getResizedDimensions(sourceWidth, sourceHeight, maxSize)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    imageBitmap?.close()
    throw new Error('Could not initialize a canvas context.')
  }

  // enable high-quality downscaling
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)

  // free the bitmap memory before encoding
  imageBitmap?.close()
  return canvas.toDataURL('image/png')
}
