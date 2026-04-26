// src/features/marketplace/data/coverImageUpload.ts
// single-image upload helper — reuses imageUploader's envelope + finalize
// sequence w/o the board-snapshot batch machinery

import { getUploadEnvelopeHeader } from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import {
  MAX_IMAGE_BYTE_SIZE,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import {
  finalizeUploadImperative,
  generateUploadUrlImperative,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import type { Id } from '@convex/_generated/dataModel'

export interface UploadedCoverImage
{
  externalId: string
}

export type CoverUploadErrorKind =
  | 'unsupported-mime'
  | 'too-large'
  | 'upload-failed'
  | 'finalize-failed'

export class CoverUploadError extends Error
{
  readonly kind: CoverUploadErrorKind

  constructor(kind: CoverUploadErrorKind, message: string)
  {
    super(message)
    this.kind = kind
    this.name = 'CoverUploadError'
  }
}

const isSupportedMime = (mime: string): mime is SupportedImageMimeType =>
  (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(mime)

// validate then upload a single image blob & return the resulting media row's
// externalId. server dedupes by content hash so re-uploading the same file
// reuses the existing mediaAssets row owned by the caller
export const uploadCoverImage = async (
  file: File
): Promise<UploadedCoverImage> =>
{
  if (!isSupportedMime(file.type))
  {
    throw new CoverUploadError(
      'unsupported-mime',
      `Unsupported image type: ${file.type || 'unknown'}. Allowed: ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}.`
    )
  }
  if (file.size > MAX_IMAGE_BYTE_SIZE)
  {
    throw new CoverUploadError(
      'too-large',
      `Image is too large (${Math.round(file.size / 1024 / 1024)}MB). Max ${Math.round(MAX_IMAGE_BYTE_SIZE / 1024 / 1024)}MB.`
    )
  }

  const { uploadUrl, uploadToken, envelopeUserId } =
    await generateUploadUrlImperative()
  const envelopeHeader = Uint8Array.from(
    getUploadEnvelopeHeader('media', envelopeUserId, uploadToken)
  )

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Blob([envelopeHeader, file], {
      type: 'application/octet-stream',
    }),
  })

  if (!response.ok)
  {
    throw new CoverUploadError(
      'upload-failed',
      `Image upload failed: HTTP ${response.status}`
    )
  }

  const { storageId } = (await response.json()) as {
    storageId: Id<'_storage'>
  }

  try
  {
    const { externalId } = await finalizeUploadImperative({
      storageId,
      uploadToken,
    })
    return { externalId }
  }
  catch (error)
  {
    throw new CoverUploadError(
      'finalize-failed',
      error instanceof Error
        ? error.message
        : 'Failed to finalize cover upload.'
    )
  }
}
