// src/features/platform/media/uploadsRepository.ts
// Convex adapters for platform media storage uploads + shared envelope helper

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { getConvexClient } from '~/features/platform/sync/lib/convexClient'
import { getUploadEnvelopeHeader } from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

interface UploadUrlBatchEntry
{
  uploadUrl: string
  uploadToken: string
}

interface UploadUrlsResult
{
  envelopeUserId: string
  urls: UploadUrlBatchEntry[]
}

export interface UploadedVariant
{
  kind: MediaVariantKind
  storageId: Id<'_storage'>
  uploadToken: string
}

export interface UploadVariantBlob
{
  kind: MediaVariantKind
  blob: Blob
}

// request N upload URLs at once. one rate-limit token per call (not per URL),
// so callers should batch the variants of one logical upload together
export const generateUploadUrlsImperative = (
  count: number
): Promise<UploadUrlsResult> =>
  getConvexClient().mutation(api.platform.media.uploads.generateUploadUrls, {
    count,
  })

export const finalizeUploadVariantsImperative = (args: {
  variants: UploadedVariant[]
}) =>
  getConvexClient().action(
    api.platform.media.uploads.finalizeUploadVariants,
    args
  )

export const getReusableMediaExternalIdsImperative = (args: {
  externalIds: string[]
  boardExternalId: string | null
}): Promise<boolean[]> =>
  getConvexClient().query(
    api.platform.media.queries.getReusableMediaExternalIds,
    args
  )

// POST a blob to a pre-signed upload URL w/ the upload-token envelope header
// prepended. shared by every variant-upload caller (cover + board image)
export const uploadEnvelopedBlob = async (args: {
  uploadUrl: string
  uploadToken: string
  envelopeUserId: string
  blob: Blob
}): Promise<Id<'_storage'>> =>
{
  const envelopeHeader = Uint8Array.from(
    getUploadEnvelopeHeader('media', args.envelopeUserId, args.uploadToken)
  )
  const response = await fetch(args.uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Blob([envelopeHeader, args.blob], {
      type: 'application/octet-stream',
    }),
  })
  if (!response.ok)
  {
    throw new Error(`image upload failed: HTTP ${response.status}`)
  }
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
  return storageId
}

export const uploadEnvelopedVariants = async (
  inputs: UploadVariantBlob[]
): ReturnType<typeof finalizeUploadVariantsImperative> =>
{
  const { envelopeUserId, urls } = await generateUploadUrlsImperative(
    inputs.length
  )
  const variants: UploadedVariant[] = await Promise.all(
    inputs.map(async (input, i) =>
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
  return finalizeUploadVariantsImperative({ variants })
}
