// convex/lib/uploadedImage.ts
// verify a client-uploaded, envelope-wrapped image: gate size, strip the auth
// envelope, validate decoded bytes, re-store clean bytes, reap the original

import { ConvexError } from 'convex/values'
import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import {
  UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
  unwrapUploadEnvelope,
} from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import {
  parseUploadedImageMetadata,
  type ParsedImageMetadata,
} from './imageValidation'
import {
  assertStorageMetadataWithinLimit,
  deleteStorageSilently,
} from './storage'

export interface VerifiedEnvelopeImage extends ParsedImageMetadata
{
  // clean re-stored bytes; the wrapped upload blob is deleted before return
  storageId: Id<'_storage'>
  byteSize: number
  // decoded payload, exposed so callers that need a content hash can derive it
  // w/o a second fetch (avatar ignores it)
  payload: Uint8Array
}

// shared finalize ladder for avatar & media uploads. `label` ('avatar'/'image')
// only flavors the rejection messages — the security checks are identical
export const loadVerifiedEnvelopeImage = async (
  ctx: ActionCtx,
  args: {
    storageId: Id<'_storage'>
    userId: Id<'users'>
    uploadToken: string
    label: string
  }
): Promise<VerifiedEnvelopeImage> =>
{
  const metadata = await ctx.runQuery(internal.lib.storage.getStorageMetadata, {
    storageId: args.storageId,
  })
  await assertStorageMetadataWithinLimit(ctx, args.storageId, metadata, {
    label: `uploaded ${args.label} blob`,
    maxBytes: MAX_IMAGE_BYTE_SIZE,
    slackBytes: UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
    requireSha256: true,
  })

  const rawBlob = await ctx.storage.get(args.storageId)
  if (!rawBlob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.storageMissing,
      message: `uploaded ${args.label} blob not found in storage`,
    })
  }

  try
  {
    const wrappedBytes = new Uint8Array(await rawBlob.arrayBuffer())
    const payload = unwrapUploadEnvelope(
      'media',
      args.userId,
      args.uploadToken,
      wrappedBytes
    )
    if (!payload)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: `upload token mismatch for ${args.label} blob`,
      })
    }
    if (payload.byteLength < 1 || payload.byteLength > MAX_IMAGE_BYTE_SIZE)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `${args.label} byteSize out of range: must be 1..${MAX_IMAGE_BYTE_SIZE}`,
      })
    }

    const { mimeType, width, height } = parseUploadedImageMetadata(payload)
    const storageId = await ctx.storage.store(
      new Blob([payload as BlobPart], { type: mimeType })
    )

    return {
      storageId,
      mimeType,
      width,
      height,
      byteSize: payload.byteLength,
      payload,
    }
  }
  finally
  {
    await deleteStorageSilently(ctx, args.storageId)
  }
}
