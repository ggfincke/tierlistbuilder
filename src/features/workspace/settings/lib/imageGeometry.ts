// src/features/workspace/settings/lib/imageGeometry.ts
// shared image helpers — dimension fitting & filename-to-label derivation

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

// derive a display label from a filename — strip extension, convert separators
export const deriveLabelFromFilename = (filename: string): string =>
{
  const label = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  return label || 'Image'
}

// encode a canvas as a PNG blob
export const canvasToPngBlob = async (
  canvas: HTMLCanvasElement
): Promise<Blob> =>
  new Promise((resolve, reject) =>
  {
    canvas.toBlob((blob) =>
    {
      if (blob)
      {
        resolve(blob)
      }
      else
      {
        reject(new Error('Failed to encode resized image as PNG.'))
      }
    }, 'image/png')
  })
