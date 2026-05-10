// convex/marketplace/seedPipeline/media.ts
// finalize/validate/cleanup helpers for seed-uploaded media variants

import { ConvexError } from 'convex/values'
import type { ActionCtx, MutationCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import type { SeedRejectedUpload } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import {
  assertNonemptyString,
  assertPositiveInteger,
} from '../../lib/assertions'
import {
  assertValidVariantRequest,
  computeVariantDedupeHash,
} from '../../lib/mediaVariants'
import { parseUploadedImageMetadata } from '../../lib/imageValidation'
import { sha256Hex } from '../../lib/sha256'
import { deleteStorageSilently } from '../../lib/storage'
import { loadOwnedSeedMediaVariantLookup } from './mediaLookup'
import type {
  SeedCleanupResult,
  SeedFinalizedMediaRow,
  SeedUploadedMediaAssetArg,
  SeedUploadedVariantArg,
  VerifiedSeedVariant,
} from './types'

export const buildSeedMediaAssetIdCache = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  contentHashes: readonly string[]
): Promise<Map<string, Id<'mediaAssets'>>> =>
{
  const unique = Array.from(new Set(contentHashes.filter((h) => h.length > 0)))
  if (unique.length === 0) return new Map()
  const { variantSets, assetById } = await loadOwnedSeedMediaVariantLookup(
    ctx,
    ownerId,
    unique
  )
  const result = new Map<string, Id<'mediaAssets'>>()
  for (const [contentHash, variants] of variantSets)
  {
    for (const variant of variants)
    {
      const asset = assetById.get(variant.mediaAssetId as string)
      if (asset)
      {
        result.set(contentHash, asset._id)
        break
      }
    }
  }
  return result
}

export const resolveSeedMediaAssetIdFromCache = (
  cache: ReadonlyMap<string, Id<'mediaAssets'>>,
  contentHash: string
): Id<'mediaAssets'> =>
{
  assertNonemptyString('mediaContentHash', contentHash)
  const mediaAssetId = cache.get(contentHash)
  if (mediaAssetId) return mediaAssetId
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.notFound,
    message: `seed media not found by content hash: ${contentHash}`,
  })
}

const rejectUploadedVariant = async (
  ctx: ActionCtx,
  assetKey: string,
  variant: SeedUploadedVariantArg,
  reason: string
): Promise<SeedRejectedUpload> =>
{
  await deleteStorageSilently(ctx, variant.storageId)
  return {
    assetKey,
    contentHash: variant.contentHash,
    storageId: variant.storageId as string,
    reason,
    cleaned: true,
  }
}

const loadVerifiedSeedVariant = async (
  ctx: ActionCtx,
  assetKey: string,
  variant: SeedUploadedVariantArg
): Promise<
  | { kind: 'verified'; variant: VerifiedSeedVariant }
  | { kind: 'rejected'; rejected: SeedRejectedUpload }
> =>
{
  const metadata = await ctx.runQuery(internal.lib.storage.getStorageMetadata, {
    storageId: variant.storageId,
  })
  if (!metadata)
  {
    return {
      kind: 'rejected',
      rejected: {
        assetKey,
        contentHash: variant.contentHash,
        storageId: variant.storageId as string,
        reason: 'uploaded storage object not found',
        cleaned: false,
      },
    }
  }
  if (metadata.size > MAX_IMAGE_BYTE_SIZE)
  {
    return {
      kind: 'rejected',
      rejected: await rejectUploadedVariant(
        ctx,
        assetKey,
        variant,
        `uploaded image blob too large: ${metadata.size} > ${MAX_IMAGE_BYTE_SIZE}`
      ),
    }
  }
  const blob = await ctx.storage.get(variant.storageId)
  if (!blob)
  {
    return {
      kind: 'rejected',
      rejected: {
        assetKey,
        contentHash: variant.contentHash,
        storageId: variant.storageId as string,
        reason: 'uploaded image blob not found',
        cleaned: false,
      },
    }
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  let parsed: ReturnType<typeof parseUploadedImageMetadata>
  let actualHash: string
  try
  {
    parsed = parseUploadedImageMetadata(bytes)
    actualHash = await sha256Hex(bytes as BufferSource)
  }
  catch (error)
  {
    return {
      kind: 'rejected',
      rejected: await rejectUploadedVariant(
        ctx,
        assetKey,
        variant,
        error instanceof Error ? error.message : 'invalid uploaded image'
      ),
    }
  }
  const failures: string[] = []
  if (actualHash !== variant.contentHash) failures.push('contentHash')
  if (parsed.mimeType !== variant.expectedMimeType) failures.push('mimeType')
  if (bytes.byteLength !== variant.expectedByteSize) failures.push('byteSize')
  if (parsed.width !== variant.expectedWidth) failures.push('width')
  if (parsed.height !== variant.expectedHeight) failures.push('height')
  if (failures.length > 0)
  {
    return {
      kind: 'rejected',
      rejected: await rejectUploadedVariant(
        ctx,
        assetKey,
        variant,
        `uploaded variant mismatch: ${failures.join(', ')}`
      ),
    }
  }

  return {
    kind: 'verified',
    variant: {
      kind: variant.kind,
      storageId: variant.storageId,
      contentHash: actualHash,
      mimeType: parsed.mimeType,
      width: parsed.width,
      height: parsed.height,
      byteSize: bytes.byteLength,
    },
  }
}

const validateSeedUploadedAsset = async (
  asset: SeedUploadedMediaAssetArg
): Promise<void> =>
{
  assertNonemptyString('assetKey', asset.assetKey)
  for (const variant of asset.variants)
  {
    assertNonemptyString('contentHash', variant.contentHash)
    assertPositiveInteger('expectedByteSize', variant.expectedByteSize)
    assertPositiveInteger('expectedWidth', variant.expectedWidth)
    assertPositiveInteger('expectedHeight', variant.expectedHeight)
  }
  await assertValidVariantRequest(asset.variants)
}

export const cleanupStorageIds = async (
  ctx: ActionCtx,
  storageIds: readonly Id<'_storage'>[]
): Promise<SeedCleanupResult> =>
{
  const cleanedStorageIds: string[] = []
  const missingStorageIds: string[] = []
  // sequential: convex-test runtime serializes storage mutations from a single
  // action, so parallel deletes drop on the floor for parallel test storeges
  for (const storageId of storageIds)
  {
    const metadata = await ctx.runQuery(
      internal.lib.storage.getStorageMetadata,
      { storageId }
    )
    if (!metadata)
    {
      missingStorageIds.push(storageId as string)
      continue
    }
    await deleteStorageSilently(ctx, storageId)
    cleanedStorageIds.push(storageId as string)
  }
  return { cleanedStorageIds, missingStorageIds }
}

export const finalizeSeedMediaAsset = async (
  ctx: ActionCtx,
  authorId: Id<'users'>,
  asset: SeedUploadedMediaAssetArg
): Promise<{
  finalized: SeedFinalizedMediaRow | null
  rejected: SeedRejectedUpload[]
}> =>
{
  await validateSeedUploadedAsset(asset)
  const verified: VerifiedSeedVariant[] = []
  const rejected: SeedRejectedUpload[] = []
  const results = await Promise.all(
    asset.variants.map((upload) =>
      loadVerifiedSeedVariant(ctx, asset.assetKey, upload)
    )
  )
  for (const result of results)
  {
    if (result.kind === 'rejected') rejected.push(result.rejected)
    else verified.push(result.variant)
  }

  if (rejected.length > 0)
  {
    await cleanupStorageIds(
      ctx,
      verified.map((variant) => variant.storageId)
    )
    return { finalized: null, rejected }
  }

  const dedupeHash = computeVariantDedupeHash(verified)
  const existing: { mediaAssetId: Id<'mediaAssets'> } | null =
    await ctx.runQuery(
      internal.marketplace.seedRuns.findSeedMediaByOwnerAndDedupeHash,
      {
        ownerId: authorId,
        dedupeHash,
      }
    )
  try
  {
    const finalized = await ctx.runMutation(
      internal.platform.media.internal.finalizeVerifiedMediaAsset,
      {
        userId: authorId,
        variants: verified,
      }
    )
    return {
      finalized: {
        assetKey: asset.assetKey,
        contentHashes: verified.map((variant) => variant.contentHash),
        mediaAssetId: finalized.mediaAssetId as string,
        reused: existing?.mediaAssetId === finalized.mediaAssetId,
      },
      rejected: [],
    }
  }
  catch (error)
  {
    await cleanupStorageIds(
      ctx,
      verified.map((variant) => variant.storageId)
    )
    throw error
  }
}
