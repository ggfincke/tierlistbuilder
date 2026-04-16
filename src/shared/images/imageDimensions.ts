// src/shared/images/imageDimensions.ts
// decode image dimensions w/ an ImageBitmap fallback to 0x0

export const getImageDimensions = async (
  blob: Blob
): Promise<{ width: number; height: number }> =>
{
  if (!('createImageBitmap' in globalThis))
  {
    return { width: 0, height: 0 }
  }

  try
  {
    const bitmap = await createImageBitmap(blob)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  }
  catch (error)
  {
    console.warn('ImageBitmap decode failed, using 0x0 fallback:', error)
    return { width: 0, height: 0 }
  }
}
