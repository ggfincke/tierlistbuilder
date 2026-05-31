// src/shared/images/imageBitmap.ts
// createImageBitmap wrapper w/ timeout, abort, & guaranteed close semantics

import { withAbortSignal, withTimeout } from '~/shared/lib/promise'

const DEFAULT_IMAGE_BITMAP_TIMEOUT_MS = 5_000

interface WithImageBitmapOptions
{
  signal?: AbortSignal
  timeoutMs?: number
  timeoutMessage?: string
}

export const withImageBitmap = async <T>(
  blob: Blob,
  fn: (bitmap: ImageBitmap) => Promise<T> | T,
  {
    signal,
    timeoutMs = DEFAULT_IMAGE_BITMAP_TIMEOUT_MS,
    timeoutMessage = 'image decode timed out',
  }: WithImageBitmapOptions = {}
): Promise<T> =>
{
  signal?.throwIfAborted()
  if (typeof createImageBitmap !== 'function')
  {
    throw new Error('ImageBitmap decoding is unavailable.')
  }

  let shouldCloseLateBitmap = false
  const bitmapPromise = createImageBitmap(blob)
  void bitmapPromise
    .then((bitmap) =>
    {
      if (shouldCloseLateBitmap) bitmap.close()
    })
    .catch(() => undefined)

  try
  {
    const bitmap = await withTimeout(
      withAbortSignal(bitmapPromise, signal),
      timeoutMs,
      {
        mode: 'reject',
        message: timeoutMessage,
        onTimeout: () =>
        {
          shouldCloseLateBitmap = true
        },
      }
    )
    try
    {
      signal?.throwIfAborted()
      return await fn(bitmap)
    }
    finally
    {
      bitmap.close()
    }
  }
  catch (error)
  {
    shouldCloseLateBitmap = true
    throw error
  }
}
