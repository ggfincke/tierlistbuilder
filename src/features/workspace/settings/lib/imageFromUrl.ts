// src/features/workspace/settings/lib/imageFromUrl.ts
// fetch remote image, resize display + editor assets, & persist to blob store

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  persistPreparedBlobRecords,
  prepareBlobRecord,
} from '~/shared/images/imagePersistence'
import { MAX_EDITOR_SOURCE_SIZE, MAX_THUMBNAIL_SIZE } from './constants'
import { deriveLabelFromFilename, drawImageToPngBlob } from './imageGeometry'
import { loadImageElement } from '~/shared/images/imageLoad'

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

// fetch a remote image, persist display + editor refs, & return item fields
export const fetchImageAsItemImage = async (
  url: string,
  maxSize = MAX_THUMBNAIL_SIZE
): Promise<NewTierItem & { label: string }> =>
{
  const img = await loadImageElement({
    src: url,
    crossOrigin: 'anonymous',
    errorMessage:
      'Failed to load image. The server may block cross-origin requests.',
  })

  const [displayBlob, sourceBlob] = await Promise.all([
    drawImageToPngBlob(img, img.naturalWidth, img.naturalHeight, maxSize),
    drawImageToPngBlob(
      img,
      img.naturalWidth,
      img.naturalHeight,
      MAX_EDITOR_SOURCE_SIZE
    ),
  ])
  const [display, source] = await Promise.all([
    prepareBlobRecord(displayBlob),
    prepareBlobRecord(sourceBlob),
  ])
  await persistPreparedBlobRecords([display, source])

  return {
    imageRef: display.imageRef,
    sourceImageRef: source.imageRef,
    label: labelFromUrl(url),
    aspectRatio: img.naturalWidth / img.naturalHeight,
  }
}
