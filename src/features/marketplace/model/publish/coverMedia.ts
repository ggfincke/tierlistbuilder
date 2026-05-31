// src/features/marketplace/model/publish/coverMedia.ts
// cover upload/removal helper shared by publish & edit flows

import { uploadCoverImage } from '~/features/marketplace/data/coverImageUpload'

interface ResolveCoverMediaExternalIdInput
{
  coverFile: File | null
  removeCover?: boolean
}

export const resolveCoverMediaExternalId = async ({
  coverFile,
  removeCover = false,
}: ResolveCoverMediaExternalIdInput): Promise<string | null | undefined> =>
{
  if (coverFile)
  {
    const { externalId } = await uploadCoverImage(coverFile)
    return externalId
  }

  return removeCover ? null : undefined
}
