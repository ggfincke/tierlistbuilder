// convex/platform/media/uploads.ts
// media upload entry points — issue token-bound upload URLs & finalize variants

import { ConvexError, v } from 'convex/values'
import { action, mutation, type ActionCtx } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  MAX_IMAGE_BYTE_SIZE,
  MAX_MEDIA_VARIANTS_PER_ASSET,
} from '@tierlistbuilder/contracts/platform/media'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import { requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'
import { internal } from '../../_generated/api'
import { parseUploadedImageMetadata } from '../../lib/imageValidation'
import { generateUploadToken } from '../../lib/uploadToken'
import { mediaVariantKindValidator } from '../../lib/validators/platform'
import { assertValidVariantRequest } from '../../lib/mediaVariants'
import {
  UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
  unwrapUploadEnvelope,
} from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import {
  assertStorageMetadataWithinLimit,
  deleteStorageSilently,
} from '../../lib/storage'
import { sha256Hex } from '../../lib/sha256'
import type { Id } from '../../_generated/dataModel'

// per-call cap on URLs in a single batch. one asset never needs more than the
// canonical tile/preview/editor set in a single upload group
const MAX_UPLOAD_URLS_PER_CALL = MAX_MEDIA_VARIANTS_PER_ASSET

const uploadUrlBatchEntryValidator = v.object({
  uploadUrl: v.string(),
  uploadToken: v.string(),
})

const uploadUrlsResultValidator = v.object({
  envelopeUserId: v.string(),
  urls: v.array(uploadUrlBatchEntryValidator),
})

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

const uploadVariantValidator = v.object({
  kind: mediaVariantKindValidator,
  storageId: v.id('_storage'),
  uploadToken: v.string(),
})

interface UploadVariantArg
{
  kind: MediaVariantKind
  storageId: Id<'_storage'>
  uploadToken: string
}

interface VerifiedVariant
{
  kind: MediaVariantKind
  storageId: Id<'_storage'>
  contentHash: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  width: number
  height: number
  byteSize: number
}

const cleanupRejectedVariants = async (
  ctx: ActionCtx,
  variants: readonly UploadVariantArg[]
): Promise<void> =>
{
  await Promise.all(
    variants.map((variant) => deleteStorageSilently(ctx, variant.storageId))
  )
}

const validateVariantRequest = async (
  ctx: ActionCtx,
  variants: readonly UploadVariantArg[]
): Promise<void> =>
{
  await assertValidVariantRequest(variants, async () =>
  {
    await cleanupRejectedVariants(ctx, variants)
  })
}

// issue N one-time upload URLs in a single rate-limited call. callers should
// request all variants of one logical upload (tile + preview + editor) in one
// batch so the rate-limit token count matches "uploads," not "blobs."
export const generateUploadUrls = mutation({
  args: { count: v.number() },
  returns: uploadUrlsResultValidator,
  handler: async (ctx, args): Promise<UploadUrlsResult> =>
  {
    if (
      !Number.isInteger(args.count) ||
      args.count < 1 ||
      args.count > MAX_UPLOAD_URLS_PER_CALL
    )
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `count must be 1..${MAX_UPLOAD_URLS_PER_CALL}`,
      })
    }
    const userId = await requireCurrentUserId(ctx)
    // charge one token per URL so a batched call costs proportional to the
    // blobs it provisions; otherwise a caller could mint MAX_UPLOAD_URLS_PER_CALL
    // urls for the same cost as a singleton call
    await enforceRateLimit(ctx, 'userMediaUpload', userId, {
      count: args.count,
    })
    const urls: UploadUrlBatchEntry[] = []
    for (let i = 0; i < args.count; i++)
    {
      urls.push({
        uploadUrl: await ctx.storage.generateUploadUrl(),
        uploadToken: generateUploadToken(),
      })
    }
    return { envelopeUserId: userId, urls }
  },
})

const assertStorageMetadata = async (
  ctx: ActionCtx,
  storageId: Id<'_storage'>
): Promise<void> =>
{
  const metadata = await ctx.runQuery(internal.lib.storage.getStorageMetadata, {
    storageId,
  })
  await assertStorageMetadataWithinLimit(ctx, storageId, metadata, {
    label: 'uploaded image blob',
    maxBytes: MAX_IMAGE_BYTE_SIZE,
    slackBytes: UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
    requireSha256: true,
  })
}

const loadVerifiedVariant = async (
  ctx: ActionCtx,
  userId: Id<'users'>,
  variant: UploadVariantArg
): Promise<VerifiedVariant> =>
{
  await assertStorageMetadata(ctx, variant.storageId)

  const rawBlob = await ctx.storage.get(variant.storageId)
  if (!rawBlob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.storageMissing,
      message: 'uploaded image blob not found in storage',
    })
  }

  try
  {
    const wrappedBytes = new Uint8Array(await rawBlob.arrayBuffer())
    const payload = unwrapUploadEnvelope(
      'media',
      userId,
      variant.uploadToken,
      wrappedBytes
    )
    if (!payload)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'upload token mismatch for image blob',
      })
    }
    if (payload.byteLength < 1 || payload.byteLength > MAX_IMAGE_BYTE_SIZE)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `byteSize out of range: must be 1..${MAX_IMAGE_BYTE_SIZE}`,
      })
    }

    const { mimeType, width, height } = parseUploadedImageMetadata(payload)
    const contentHash = await sha256Hex(payload as BufferSource)
    const cleanStorageId = await ctx.storage.store(
      new Blob([payload as BlobPart], { type: mimeType })
    )

    return {
      kind: variant.kind,
      storageId: cleanStorageId,
      contentHash,
      mimeType,
      width,
      height,
      byteSize: payload.byteLength,
    }
  }
  finally
  {
    await deleteStorageSilently(ctx, variant.storageId)
  }
}

const finalizeVariantsImpl = async (
  ctx: ActionCtx,
  variants: readonly UploadVariantArg[]
): Promise<{ externalId: string }> =>
{
  const userId = await requireCurrentUserId(ctx)
  await validateVariantRequest(ctx, variants)
  const verified: VerifiedVariant[] = []
  try
  {
    for (const variant of variants)
    {
      verified.push(await loadVerifiedVariant(ctx, userId, variant))
    }

    const { externalId } = await ctx.runMutation(
      internal.platform.media.internal.finalizeVerifiedMediaAsset,
      {
        userId,
        variants: verified,
      }
    )
    return { externalId }
  }
  catch (error)
  {
    await Promise.all(
      verified.map((variant) => deleteStorageSilently(ctx, variant.storageId))
    )
    throw error
  }
}

export const finalizeUploadVariants = action({
  args: {
    variants: v.array(uploadVariantValidator),
  },
  returns: v.object({ externalId: v.string() }),
  handler: async (ctx, args): Promise<{ externalId: string }> =>
    await finalizeVariantsImpl(ctx, args.variants),
})
