// src/features/workspace/settings/lib/imageLoad.ts
// shared Image() wrappers — element loading w/ timeout & aspect-ratio decode

const DEFAULT_LOAD_TIMEOUT_MS = 15_000

interface LoadImageOptions
{
  src: string
  // CORS mode; 'anonymous' is required for canvas read-back on remote images
  crossOrigin?: 'anonymous' | 'use-credentials'
  // override the default load timeout
  timeoutMs?: number
  // custom error message used for the onerror rejection
  errorMessage?: string
}

// load an image via <img>; resolves w/ the element once decoded, rejects on
// error or after timeoutMs. single source of truth used by fetch, resize, &
// backfill paths
export const loadImageElement = ({
  src,
  crossOrigin,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  errorMessage = 'Failed to load image.',
}: LoadImageOptions): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) =>
  {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = crossOrigin

    const timer = setTimeout(() =>
    {
      img.src = ''
      reject(new Error('Image load timed out.'))
    }, timeoutMs)

    img.onload = () =>
    {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () =>
    {
      clearTimeout(timer)
      reject(new Error(errorMessage))
    }

    img.src = src
  })

// decode a src string & resolve to its natural w/h ratio, or null when the
// image can't be decoded within the timeout
export const decodeImageAspectRatioFromSrc = async (
  src: string,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS
): Promise<number | null> =>
{
  try
  {
    const img = await loadImageElement({ src, timeoutMs })
    if (img.naturalWidth > 0 && img.naturalHeight > 0)
    {
      return img.naturalWidth / img.naturalHeight
    }
    return null
  }
  catch
  {
    return null
  }
}
