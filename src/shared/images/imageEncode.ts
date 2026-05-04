// src/shared/images/imageEncode.ts
// canvas-based image resize & blob encoding shared by upload, fetch, & rendition
// pipelines. browser-only — relies on document.createElement('canvas')

interface ImageBlobEncodeOptions
{
  mimeType?: string
  quality?: number
}

// compute output dimensions that fit within maxSize while preserving aspect ratio
export const getResizedDimensions = (
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } =>
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

// draw a source image into a canvas at the resized dimensions; returns the
// canvas so callers can either encode it to a blob OR re-use it as the source
// for a downstream draw (progressive downscale)
export const drawImageToCanvas = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSize: number
): HTMLCanvasElement =>
{
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
    throw new Error('Could not initialize a canvas context.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)

  return canvas
}

// encode a canvas as the requested blob type
export const canvasToBlob = async (
  canvas: HTMLCanvasElement,
  { mimeType = 'image/png', quality }: ImageBlobEncodeOptions = {}
): Promise<Blob> =>
  new Promise((resolve, reject) =>
  {
    canvas.toBlob(
      (blob) =>
      {
        if (blob)
        {
          resolve(blob)
        }
        else
        {
          reject(new Error(`Failed to encode resized image as ${mimeType}.`))
        }
      },
      mimeType,
      quality
    )
  })

// draw a source image into an encoded blob capped at maxSize on the long edge
export const drawImageToBlob = async (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSize: number,
  encodeOptions: ImageBlobEncodeOptions = {}
): Promise<Blob> =>
  canvasToBlob(
    drawImageToCanvas(source, sourceWidth, sourceHeight, maxSize),
    encodeOptions
  )

export const drawImageToPngBlob = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSize: number
): Promise<Blob> =>
  drawImageToBlob(source, sourceWidth, sourceHeight, maxSize, {
    mimeType: 'image/png',
  })
