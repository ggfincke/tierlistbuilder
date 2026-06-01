// src/features/workspace/board-settings/lib/imageFromUrl.ts
// fetch a remote image, prepare the three rendition blobs, & return TierItem fields

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import { loadImageElement } from '~/shared/images/imageLoad'
import { persistItemRenditions } from '~/shared/images/prepareItemRenditions'
import { MAX_THUMBNAIL_SIZE } from '~/shared/images/renditions'
import { deriveLabelFromFilename } from '~/shared/lib/fileName'

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

// fetch a remote image, persist preview + tile + editor refs, & return fields
export const fetchImageAsItemImage = async (
  url: string,
  previewMaxSize = MAX_THUMBNAIL_SIZE
): Promise<NewTierItem & { label: string }> =>
{
  const img = await loadImageElement({
    src: url,
    crossOrigin: 'anonymous',
    errorMessage:
      'Failed to load image. The server may block cross-origin requests.',
  })

  const refs = await persistItemRenditions(
    img,
    img.naturalWidth,
    img.naturalHeight,
    { previewMaxSize }
  )

  return {
    ...refs,
    label: labelFromUrl(url),
  }
}
