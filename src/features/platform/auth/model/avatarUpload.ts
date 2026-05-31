// src/features/platform/auth/model/avatarUpload.ts
// resize avatar picks to a square blob, then stage them in Convex storage

import type { Id } from '@convex/_generated/dataModel'
import { SUPPORTED_IMAGE_MIME_TYPES } from '@tierlistbuilder/contracts/platform/media'
import { validateImageFile } from '~/features/platform/media/imageFileValidation'
import {
  generateUploadUrlsImperative,
  uploadEnvelopedBlob,
} from '~/features/platform/media/uploadsRepository'
import { withImageBitmap } from '~/shared/images/imageBitmap'
import { canvasToBlob } from '~/shared/images/imageEncode'

export const AVATAR_FILE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',')

// cap the square avatar at 512px but never upscale a smaller source. webp keeps
// photographic avatars small vs a lossless png re-encode
const AVATAR_MAX_SIZE = 512
const AVATAR_MIME_TYPE = 'image/webp'
const AVATAR_QUALITY = 0.9

interface AvatarUploadPayload
{
  storageId: Id<'_storage'>
  uploadToken: string
}

const centerCropAvatar = async (file: File): Promise<Blob> =>
{
  const validation = validateImageFile(file)
  if (!validation.ok)
  {
    throw new Error(validation.message ?? 'Invalid avatar image.')
  }

  return withImageBitmap(file, async (bitmap) =>
  {
    const sourceSize = Math.min(bitmap.width, bitmap.height)
    const sourceX = Math.floor((bitmap.width - sourceSize) / 2)
    const sourceY = Math.floor((bitmap.height - sourceSize) / 2)
    const targetSize = Math.min(AVATAR_MAX_SIZE, sourceSize)
    const canvas = document.createElement('canvas')
    canvas.width = targetSize
    canvas.height = targetSize
    const context = canvas.getContext('2d')
    if (!context)
    {
      throw new Error('Could not initialize avatar crop canvas.')
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      targetSize,
      targetSize
    )
    return await canvasToBlob(canvas, {
      mimeType: AVATAR_MIME_TYPE,
      quality: AVATAR_QUALITY,
    })
  })
}

export const uploadAvatarFile = async (
  file: File
): Promise<AvatarUploadPayload> =>
{
  const blob = await centerCropAvatar(file)
  const { envelopeUserId, urls } = await generateUploadUrlsImperative(1)
  const { uploadUrl, uploadToken } = urls[0]
  const storageId = await uploadEnvelopedBlob({
    uploadUrl,
    uploadToken,
    envelopeUserId,
    blob,
  })
  return { storageId, uploadToken }
}
