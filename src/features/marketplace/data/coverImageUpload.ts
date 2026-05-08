// src/features/marketplace/data/coverImageUpload.ts
// resize cover uploads into tile + preview variants before finalizing media

import {
  MAX_IMAGE_BYTE_SIZE,
  type MediaVariantKind,
} from '@tierlistbuilder/contracts/platform/media'
import {
  canvasToBlob,
  drawImageToCanvas,
  drawImageToPngBlob,
} from '~/shared/images/imageEncode'
import { validateImageFile } from '~/features/platform/media/imageFileValidation'
import {
  finalizeUploadVariantsImperative,
  generateUploadUrlsImperative,
  uploadEnvelopedBlob,
  type UploadedVariant,
} from '~/features/platform/media/uploadsRepository'

const COVER_TILE_MAX_SIZE = 120
// preview is the master image that runtime CSS-crops per-surface from. higher
// than the legacy 1280 cap so tight per-surface crops still have enough pixels
// to fill detail-hero & browse-hero containers on retina displays
const COVER_PREVIEW_MAX_SIZE = 2560
const COVER_PREVIEW_MIN_SIZE = 1024
const COVER_PREVIEW_RETRY_SCALE = 0.8
const COVER_PREVIEW_QUALITY_STEPS = [0.86, 0.76, 0.66] as const
const COVER_PREVIEW_MIME_TYPES = ['image/webp', 'image/jpeg'] as const

interface UploadedCoverImage
{
  externalId: string
}

class CoverUploadError extends Error
{
  constructor(message: string)
  {
    super(message)
    this.name = 'CoverUploadError'
  }
}

const drawResizedImage = (
  source: ImageBitmap,
  maxSize: number
): HTMLCanvasElement =>
  drawImageToCanvas(source, source.width, source.height, maxSize)

const resizeImageToPngBlob = async (
  source: ImageBitmap,
  maxSize: number
): Promise<Blob> =>
  await drawImageToPngBlob(source, source.width, source.height, maxSize)

const encodePreviewCanvas = async (
  canvas: HTMLCanvasElement
): Promise<Blob> =>
{
  let latestBlob: Blob | null = null
  for (const mimeType of COVER_PREVIEW_MIME_TYPES)
  {
    for (const quality of COVER_PREVIEW_QUALITY_STEPS)
    {
      const blob = await canvasToBlob(canvas, { mimeType, quality })
      if (blob.type !== mimeType)
      {
        latestBlob = blob
        break
      }
      latestBlob = blob
      if (blob.size <= MAX_IMAGE_BYTE_SIZE) return blob
    }
  }
  if (latestBlob) return latestBlob
  return await canvasToBlob(canvas, {
    mimeType: 'image/jpeg',
    quality: COVER_PREVIEW_QUALITY_STEPS[0],
  })
}

const resizeImageToPreviewBlob = async (source: ImageBitmap): Promise<Blob> =>
{
  let maxSize = COVER_PREVIEW_MAX_SIZE
  while (true)
  {
    const blob = await encodePreviewCanvas(drawResizedImage(source, maxSize))
    if (blob.size <= MAX_IMAGE_BYTE_SIZE) return blob
    if (maxSize <= COVER_PREVIEW_MIN_SIZE)
    {
      throw new Error('Encoded cover preview exceeds the image size limit.')
    }
    maxSize = Math.max(
      COVER_PREVIEW_MIN_SIZE,
      Math.floor(maxSize * COVER_PREVIEW_RETRY_SCALE)
    )
  }
}

const prepareCoverVariants = async (
  file: File
): Promise<Array<{ kind: MediaVariantKind; blob: Blob }>> =>
{
  const bitmap = await createImageBitmap(file)
  try
  {
    const [tileBlob, previewBlob] = await Promise.all([
      resizeImageToPngBlob(bitmap, COVER_TILE_MAX_SIZE),
      resizeImageToPreviewBlob(bitmap),
    ])
    return [
      { kind: 'tile', blob: tileBlob },
      { kind: 'preview', blob: previewBlob },
    ]
  }
  finally
  {
    bitmap.close()
  }
}

export const uploadCoverImage = async (
  file: File
): Promise<UploadedCoverImage> =>
{
  const validation = validateImageFile(file)
  if (!validation.ok)
  {
    throw new CoverUploadError(validation.message ?? 'Invalid cover image.')
  }

  try
  {
    const variantInputs = await prepareCoverVariants(file)
    const { envelopeUserId, urls } = await generateUploadUrlsImperative(
      variantInputs.length
    )
    const variants: UploadedVariant[] = await Promise.all(
      variantInputs.map(async (input, i) =>
      {
        const { uploadUrl, uploadToken } = urls[i]
        const storageId = await uploadEnvelopedBlob({
          uploadUrl,
          uploadToken,
          envelopeUserId,
          blob: input.blob,
        })
        return { kind: input.kind, storageId, uploadToken }
      })
    )
    const { externalId } = await finalizeUploadVariantsImperative({ variants })
    return { externalId }
  }
  catch (error)
  {
    if (error instanceof CoverUploadError) throw error
    throw new CoverUploadError(
      error instanceof Error
        ? error.message
        : 'Failed to finalize cover upload.'
    )
  }
}
