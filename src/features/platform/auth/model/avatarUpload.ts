// src/features/platform/auth/model/avatarUpload.ts
// validate avatar picks before upload

import { SUPPORTED_IMAGE_MIME_TYPES } from '@tierlistbuilder/contracts/platform/media'
import { validateImageFile } from '~/features/platform/media/imageFileValidation'
import { canvasToBlob } from '~/shared/images/imageEncode'

export const AVATAR_FILE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',')

// cap the square avatar at 512px but never upscale a smaller source. webp keeps
// photographic avatars small vs a lossless png re-encode
const AVATAR_MAX_SIZE = 512
const AVATAR_MIME_TYPE = 'image/webp'
const AVATAR_QUALITY = 0.9

interface AvatarUploadPayload
{
  storageId: string
  uploadToken: string
}

const centerCropAvatar = async (file: File): Promise<Blob> =>
{
  const validation = validateImageFile(file)
  if (!validation.ok)
  {
    throw new Error(validation.message ?? 'Invalid avatar image.')
  }

  const bitmap = await createImageBitmap(file)
  try
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
  }
  finally
  {
    bitmap.close()
  }
}

export const uploadAvatarFile = async (
  file: File
): Promise<AvatarUploadPayload> =>
{
  await centerCropAvatar(file)
  throw new Error('Avatar uploads are not available in this UI-only build.')
}
