// src/features/platform/media/imageFileValidation.ts
// client-side image file validation shared by media upload flows

import {
  MAX_IMAGE_BYTE_SIZE,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import { brandedStringArrayIncludes } from '~/shared/lib/typeGuards'

interface ImageFileValidationResult
{
  ok: boolean
  message: string | null
}

const isSupportedImageMimeType = (
  mime: string
): mime is SupportedImageMimeType =>
  brandedStringArrayIncludes(SUPPORTED_IMAGE_MIME_TYPES, mime)

const formatImageSizeLimit = (): string =>
  `${Math.round(MAX_IMAGE_BYTE_SIZE / 1024 / 1024)}MB`

export const validateImageFile = (
  file: Pick<File, 'type' | 'size'>
): ImageFileValidationResult =>
{
  if (!isSupportedImageMimeType(file.type))
  {
    return {
      ok: false,
      message: `Unsupported image type. Allowed: ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}`,
    }
  }

  if (file.size > MAX_IMAGE_BYTE_SIZE)
  {
    return {
      ok: false,
      message: `Image is too large (max ${formatImageSizeLimit()}).`,
    }
  }

  return { ok: true, message: null }
}
