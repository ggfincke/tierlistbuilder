// src/features/marketplace/data/coverImageUpload.ts
// resize cover uploads into tile + preview variants before finalizing media

import {
  MAX_IMAGE_BYTE_SIZE,
  SUPPORTED_IMAGE_MIME_TYPES,
  type MediaVariantKind,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import { brandedStringArrayIncludes } from '~/shared/lib/typeGuards'
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

type CanvasImageMimeType = 'image/png' | 'image/webp' | 'image/jpeg'

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

const isSupportedMime = (mime: string): mime is SupportedImageMimeType =>
  brandedStringArrayIncludes(SUPPORTED_IMAGE_MIME_TYPES, mime)

const getResizedDimensions = (
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

const canvasToBlob = async (
  canvas: HTMLCanvasElement,
  mimeType: CanvasImageMimeType,
  quality?: number
): Promise<Blob> =>
  new Promise((resolve, reject) =>
  {
    canvas.toBlob(
      (blob) =>
      {
        if (blob) resolve(blob)
        else reject(new Error('Failed to encode resized image.'))
      },
      mimeType,
      quality
    )
  })

const drawResizedImage = (
  source: ImageBitmap,
  maxSize: number
): HTMLCanvasElement =>
{
  const { width, height } = getResizedDimensions(
    source.width,
    source.height,
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

const resizeImageToPngBlob = async (
  source: ImageBitmap,
  maxSize: number
): Promise<Blob> =>
  await canvasToBlob(drawResizedImage(source, maxSize), 'image/png')

const encodePreviewCanvas = async (
  canvas: HTMLCanvasElement
): Promise<Blob> =>
{
  let latestBlob: Blob | null = null
  for (const mimeType of COVER_PREVIEW_MIME_TYPES)
  {
    for (const quality of COVER_PREVIEW_QUALITY_STEPS)
    {
      const blob = await canvasToBlob(canvas, mimeType, quality)
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
  return await canvasToBlob(
    canvas,
    'image/jpeg',
    COVER_PREVIEW_QUALITY_STEPS[0]
  )
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
  if (!isSupportedMime(file.type))
  {
    throw new CoverUploadError(
      `Unsupported image type: ${file.type || 'unknown'}. Allowed: ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}.`
    )
  }
  if (file.size > MAX_IMAGE_BYTE_SIZE)
  {
    throw new CoverUploadError(
      `Image is too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${Math.round(MAX_IMAGE_BYTE_SIZE / 1024 / 1024)}MB.`
    )
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
