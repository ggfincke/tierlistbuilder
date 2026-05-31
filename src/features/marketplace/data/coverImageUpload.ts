// src/features/marketplace/data/coverImageUpload.ts
// frontend-only cover upload seam for the extracted UI shell

import { validateImageFile } from '~/features/platform/media/imageFileValidation'

interface UploadedCoverImage
{
  externalId: string
}

export const uploadCoverImage = async (
  file: File
): Promise<UploadedCoverImage> =>
{
  const validation = validateImageFile(file)
  if (!validation.ok)
  {
    throw new Error(validation.message ?? 'Invalid cover image.')
  }

  throw new Error('Cover uploads are not available in this UI-only build.')
}
