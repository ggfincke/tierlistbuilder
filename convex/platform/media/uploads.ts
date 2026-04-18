// convex/platform/media/uploads.ts
// media upload mutations — generate upload URLs & finalize w/ dedup

import { ConvexError, v } from 'convex/values'
import { mutation } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { generateMediaAssetExternalId } from '@tierlistbuilder/contracts/lib/ids'
import { requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'

// hard cap on image byte size — 20MB matches the frontend uploader's cap
const MAX_IMAGE_BYTE_SIZE = 20 * 1024 * 1024
// sanity bound on image dimensions — rejects obviously malformed data
const MAX_IMAGE_DIMENSION = 10_000
// sha256 hex digest is always 64 lowercase hex chars
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/

// generate a one-time upload URL for the frontend to POST image bytes. this is
// the single rate-limit point for the 2-phase upload flow, so aborted attempts
// still count against quota
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await enforceRateLimit(ctx, 'userMediaUpload', userId)
    return await ctx.storage.generateUploadUrl()
  },
})

// finalize an upload — dedup by owner+hash, insert mediaAssets if new, & keep
// the narrow mimeType validator below as the single source of truth. rate
// limiting lives on generateUploadUrl — one token per upload attempt
export const finalizeUpload = mutation({
  args: {
    storageId: v.id('_storage'),
    contentHash: v.string(),
    mimeType: v.union(
      v.literal('image/jpeg'),
      v.literal('image/png'),
      v.literal('image/webp'),
      v.literal('image/gif')
    ),
    width: v.number(),
    height: v.number(),
    byteSize: v.number(),
  },
  handler: async (ctx, args): Promise<{ externalId: string }> =>
  {
    const userId = await requireCurrentUserId(ctx)

    if (!HEX_SHA256_PATTERN.test(args.contentHash))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: 'contentHash must be 64-char lowercase hex (sha256)',
      })
    }

    if (
      !Number.isInteger(args.width) ||
      args.width < 1 ||
      args.width > MAX_IMAGE_DIMENSION
    )
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `width out of range: must be 1..${MAX_IMAGE_DIMENSION}`,
      })
    }

    if (
      !Number.isInteger(args.height) ||
      args.height < 1 ||
      args.height > MAX_IMAGE_DIMENSION
    )
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `height out of range: must be 1..${MAX_IMAGE_DIMENSION}`,
      })
    }

    if (
      !Number.isInteger(args.byteSize) ||
      args.byteSize < 1 ||
      args.byteSize > MAX_IMAGE_BYTE_SIZE
    )
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `byteSize out of range: must be 1..${MAX_IMAGE_BYTE_SIZE}`,
      })
    }

    const existing = await ctx.db
      .query('mediaAssets')
      .withIndex('byOwnerAndHash', (q) =>
        q.eq('ownerId', userId).eq('contentHash', args.contentHash)
      )
      .unique()

    if (existing)
    {
      // duplicate — delete the just-uploaded blob & return the existing asset
      await ctx.storage.delete(args.storageId)
      return { externalId: existing.externalId }
    }

    const externalId = generateMediaAssetExternalId()

    await ctx.db.insert('mediaAssets', {
      ownerId: userId,
      externalId,
      storageId: args.storageId,
      contentHash: args.contentHash,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
      byteSize: args.byteSize,
      createdAt: Date.now(),
    })

    return { externalId }
  },
})
