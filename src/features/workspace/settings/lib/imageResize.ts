// src/features/workspace/settings/lib/imageResize.ts
// upload pipeline: hand each File off to the rendition prepare helper, persist
// every resulting blob in one batch, & emit NewTierItem rows for the board

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  BLOB_PREPARE_CONCURRENCY,
  persistPreparedBlobRecords,
} from '~/shared/images/imagePersistence'
import {
  buildItemRenditionRecords,
  collectRenditionRecords,
  toItemImageRefs,
} from '~/shared/images/prepareItemRenditions'
import { withImageBitmap } from '~/shared/images/imageBitmap'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { deriveLabelFromFilename } from '~/shared/lib/fileName'

// processed upload result w/ partial-failure accounting
interface ProcessImageFilesResult
{
  items: Array<NewTierItem & { label: string }>
  failedCount: number
}

// filter, resize, persist, & collect image files
export const processImageFiles = async (
  files: File[]
): Promise<ProcessImageFilesResult> =>
{
  const images = files.filter((f) => f.type.startsWith('image/'))
  const prepared = await mapAsyncLimit(
    images,
    BLOB_PREPARE_CONCURRENCY,
    async (imageFile) =>
    {
      try
      {
        const records = await buildFileRenditionRecords(imageFile)
        return {
          records,
          label: deriveLabelFromFilename(imageFile.name),
        }
      }
      catch
      {
        return null
      }
    }
  )

  const successes = prepared.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null
  )

  await persistPreparedBlobRecords(
    successes.flatMap(({ records }) => collectRenditionRecords(records))
  )

  const items = successes.map(({ records, label }) => ({
    ...toItemImageRefs(records),
    label,
    aspectRatio: records.aspectRatio,
  })) satisfies Array<NewTierItem & { label: string }>

  return {
    items,
    failedCount: images.length - items.length,
  }
}

// decode the file once, run progressive downscale, & release the bitmap
// as soon as the rendition canvases are built
const buildFileRenditionRecords = async (file: File) =>
  withImageBitmap(file, (imageBitmap) =>
    buildItemRenditionRecords(
      imageBitmap,
      imageBitmap.width,
      imageBitmap.height
    )
  )
