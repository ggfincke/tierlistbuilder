// convex/platform/media/uploads.ts
// media upload entry points — issue token-bound upload URLs & finalize in an action

import { ConvexError, v } from 'convex/values'
import { action, mutation } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import { requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'
import { internal } from '../../_generated/api'
import { parseUploadedImageMetadata } from '../../lib/imageValidation'
import { generateUploadToken } from '../../lib/uploadToken'
import {
  UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
  unwrapUploadEnvelope,
} from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import { deleteStorageSilently } from '../../lib/storage'
import { sha256Hex } from '../../lib/sha256'
import type { Id } from '../../_generated/dataModel'

const uploadUrlResultValidator = v.object({
  uploadUrl: v.string(),
  uploadToken: v.string(),
  envelopeUserId: v.string(),
})

// generate a one-time upload URL for the frontend to POST image bytes. this is
// the single rate-limit point for the 2-phase upload flow, so aborted attempts
// still count against quota
export const generateUploadUrl = mutation({
  args: {},
  returns: uploadUrlResultValidator,
  handler: async (
    ctx
  ): Promise<{
    uploadUrl: string
    uploadToken: string
    envelopeUserId: string
  }> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await enforceRateLimit(ctx, 'userMediaUpload', userId)
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      uploadToken: generateUploadToken(),
      envelopeUserId: userId,
    }
  },
})

// finalize an upload — verify the upload envelope, inspect the real image
// bytes server-side, then hand off the clean blob to an internal mutation
export const finalizeUpload = action({
  args: {
    storageId: v.id('_storage'),
    uploadToken: v.string(),
  },
  returns: v.object({ externalId: v.string() }),
  handler: async (ctx, args): Promise<{ externalId: string }> =>
  {
    const userId = await requireCurrentUserId(ctx)

    // pre-fetch size gate — reject oversized blobs before ctx.storage.get
    // forces a full arrayBuffer() allocation. slack absorbs envelope header
    const storageSize = await ctx.runQuery(
      internal.lib.storage.peekStorageSize,
      { storageId: args.storageId }
    )
    if (storageSize === null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.storageMissing,
        message: 'uploaded image blob not found in storage',
      })
    }
    if (storageSize > MAX_IMAGE_BYTE_SIZE + UPLOAD_ENVELOPE_MAX_HEADER_BYTES)
    {
      await deleteStorageSilently(ctx, args.storageId)
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `uploaded image blob too large: ${storageSize} > ${MAX_IMAGE_BYTE_SIZE}`,
      })
    }

    const rawBlob = await ctx.storage.get(args.storageId)
    if (!rawBlob)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.storageMissing,
        message: 'uploaded image blob not found in storage',
      })
    }

    const wrappedBytes = new Uint8Array(await rawBlob.arrayBuffer())
    const payload = unwrapUploadEnvelope(
      'media',
      userId,
      args.uploadToken,
      wrappedBytes
    )
    if (!payload)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'upload token mismatch for image blob',
      })
    }

    let cleanStorageId: Id<'_storage'> | null = null
    try
    {
      if (payload.byteLength < 1 || payload.byteLength > MAX_IMAGE_BYTE_SIZE)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.payloadTooLarge,
          message: `byteSize out of range: must be 1..${MAX_IMAGE_BYTE_SIZE}`,
        })
      }

      const { mimeType, width, height } = parseUploadedImageMetadata(payload)
      // cast at the Blob/BufferSource boundary — lib.dom narrows to
      // Uint8Array<ArrayBuffer> but subarrays carry ArrayBufferLike. zero-copy
      const contentHash = await sha256Hex(payload as BufferSource)

      // store without the sha256 integrity option; local Convex rejects it
      // inside the storage syscall w/ "invalid HTTP header"
      cleanStorageId = await ctx.storage.store(
        new Blob([payload as BlobPart], { type: mimeType })
      )

      const { externalId } = await ctx.runMutation(
        internal.platform.media.internal.finalizeVerifiedUpload,
        {
          userId,
          storageId: cleanStorageId,
          contentHash,
          mimeType,
          width,
          height,
          byteSize: payload.byteLength,
        }
      )
      return { externalId }
    }
    catch (error)
    {
      if (cleanStorageId)
      {
        await deleteStorageSilently(ctx, cleanStorageId)
      }
      throw error
    }
    finally
    {
      await deleteStorageSilently(ctx, args.storageId)
    }
  },
})
