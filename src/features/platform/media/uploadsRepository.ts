// src/features/platform/media/uploadsRepository.ts
// Convex adapters for platform media storage uploads

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { convexClient } from '~/features/platform/sync/lib/convexClient'

export const generateUploadUrlImperative = (): Promise<{
  uploadUrl: string
  uploadToken: string
  envelopeUserId: string
}> => convexClient.mutation(api.platform.media.uploads.generateUploadUrl, {})

export const finalizeUploadImperative = (args: {
  storageId: Id<'_storage'>
  uploadToken: string
}) => convexClient.action(api.platform.media.uploads.finalizeUpload, args)
