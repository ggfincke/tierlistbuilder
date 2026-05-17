// convex/platform/media/internal.ts
// internal media functions: finalize verified variants & reap unreachable assets

import { ConvexError, v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { BATCH_LIMITS } from '../../lib/limits'
import { generateMediaAssetExternalId } from '@tierlistbuilder/contracts/lib/ids'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { deleteStorageSilently } from '../../lib/storage'
import {
  MAX_MEDIA_VARIANTS_PER_ASSET,
  MEDIA_VARIANT_KINDS,
  type MediaVariantKind,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import {
  computeVariantDedupeHash,
  type MediaVariantSummary,
} from '../../lib/mediaVariants'
import {
  imageMimeTypeValidator,
  mediaVariantKindValidator,
} from '../../lib/validators/platform'

const verifiedVariantArgsValidator = {
  kind: mediaVariantKindValidator,
  storageId: v.id('_storage'),
  contentHash: v.string(),
  mimeType: imageMimeTypeValidator,
  width: v.number(),
  height: v.number(),
  byteSize: v.number(),
}

const verifiedMediaAssetArgsValidator = {
  userId: v.id('users'),
  variants: v.array(v.object(verifiedVariantArgsValidator)),
}

interface VerifiedVariantArgs
{
  kind: MediaVariantKind
  storageId: Id<'_storage'>
  contentHash: string
  mimeType: SupportedImageMimeType
  width: number
  height: number
  byteSize: number
}

interface VerifiedMediaAssetArgs
{
  userId: Id<'users'>
  variants: VerifiedVariantArgs[]
}

interface FinalizedUpload
{
  externalId: string
  mediaAssetId: Id<'mediaAssets'>
}

interface NormalizedVariants
{
  variants: VerifiedVariantArgs[]
  dedupeHash: string
}

interface NormalizedVerifiedMediaAsset extends NormalizedVariants
{
  userId: Id<'users'>
  key: string
}

const VARIANT_FIELD_BY_KIND: Record<
  MediaVariantKind,
  'tileVariant' | 'previewVariant' | 'editorVariant'
> = {
  tile: 'tileVariant',
  preview: 'previewVariant',
  editor: 'editorVariant',
}

// safety margin above MEDIA_VARIANT_KINDS so duplicate-kind rows from a prior
// failed insert can be observed (& skipped) rather than silently truncated
const MAX_VARIANT_ROWS_PER_ASSET = MEDIA_VARIANT_KINDS.length * 2

// in-flight upload protection: skip rows newer than this window. covers the race
// between finalizeUpload inserting mediaAssets & upsertBoardState wiring the reference -
// a GC pass between those two would otherwise reap a fresh asset
const GC_GRACE_MS = 60 * 60 * 1000

// concurrency for per-asset reference checks. media-reference indexes are
// independent across assets so bounded parallelism cuts wall clock
// significantly for nightly batches
const REFERENCE_CHECK_CONCURRENCY = 8

const normalizeVerifiedVariants = (
  variants: readonly VerifiedVariantArgs[]
): NormalizedVariants =>
{
  if (variants.length < 1 || variants.length > MAX_MEDIA_VARIANTS_PER_ASSET)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `media asset finalization requires 1..${MAX_MEDIA_VARIANTS_PER_ASSET} variants`,
    })
  }

  const byKind = new Map<MediaVariantKind, VerifiedVariantArgs>()
  for (const variant of variants)
  {
    if (byKind.has(variant.kind))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `duplicate media variant kind: ${variant.kind}`,
      })
    }
    byKind.set(variant.kind, variant)
  }

  const tile = byKind.get('tile')
  if (!tile)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'media asset finalization requires a tile variant',
    })
  }

  const normalizedVariants = [...byKind.values()]
  return {
    variants: normalizedVariants,
    dedupeHash: computeVariantDedupeHash(normalizedVariants),
  }
}

const normalizeVerifiedMediaAsset = (
  args: VerifiedMediaAssetArgs
): NormalizedVerifiedMediaAsset =>
{
  const normalized = normalizeVerifiedVariants(args.variants)
  return {
    userId: args.userId,
    ...normalized,
    key: `${args.userId}:${normalized.dedupeHash}`,
  }
}

const runInChunks = async <T, R>(
  items: readonly T[],
  chunkSize: number,
  task: (item: T) => Promise<R>
): Promise<R[]> =>
{
  const results: R[] = []
  for (let i = 0; i < items.length; i += chunkSize)
  {
    results.push(
      ...(await Promise.all(items.slice(i, i + chunkSize).map(task)))
    )
  }
  return results
}

const deleteVariantStorageIds = async (
  ctx: MutationCtx,
  variants: readonly VerifiedVariantArgs[]
): Promise<void> =>
{
  await Promise.all(
    variants.map((variant) => deleteStorageSilently(ctx, variant.storageId))
  )
}

const toMediaVariantSummary = (
  variant: VerifiedVariantArgs
): MediaVariantSummary => ({
  storageId: variant.storageId,
  width: variant.width,
  height: variant.height,
  byteSize: variant.byteSize,
  mimeType: variant.mimeType,
  contentHash: variant.contentHash,
})

const buildVariantSummariesForInsert = (
  variants: readonly VerifiedVariantArgs[]
): Pick<
  Doc<'mediaAssets'>,
  'tileVariant' | 'previewVariant' | 'editorVariant'
> =>
{
  const summaries: Partial<
    Pick<Doc<'mediaAssets'>, 'tileVariant' | 'previewVariant' | 'editorVariant'>
  > = {}
  for (const variant of variants)
  {
    summaries[VARIANT_FIELD_BY_KIND[variant.kind]] =
      toMediaVariantSummary(variant)
  }
  return summaries as Pick<
    Doc<'mediaAssets'>,
    'tileVariant' | 'previewVariant' | 'editorVariant'
  >
}

const insertMissingVariants = async (
  ctx: MutationCtx,
  mediaAssetId: Id<'mediaAssets'>,
  variants: readonly VerifiedVariantArgs[]
): Promise<void> =>
{
  const now = Date.now()
  const inserted = await Promise.all(
    variants.map(async (variant) =>
    {
      const existing = await ctx.db
        .query('mediaVariants')
        .withIndex('byMediaAssetAndKind', (q) =>
          q.eq('mediaAssetId', mediaAssetId).eq('kind', variant.kind)
        )
        .unique()

      if (existing)
      {
        await deleteStorageSilently(ctx, variant.storageId)
        return null
      }

      await ctx.db.insert('mediaVariants', {
        mediaAssetId,
        kind: variant.kind,
        storageId: variant.storageId,
        width: variant.width,
        height: variant.height,
        byteSize: variant.byteSize,
        mimeType: variant.mimeType,
        contentHash: variant.contentHash,
        createdAt: now,
      })
      return [
        VARIANT_FIELD_BY_KIND[variant.kind],
        toMediaVariantSummary(variant),
      ] as const
    })
  )

  const patchEntries = inserted.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null
  )
  if (patchEntries.length > 0)
  {
    await ctx.db.patch(
      mediaAssetId,
      Object.fromEntries(patchEntries) as Partial<
        Pick<
          Doc<'mediaAssets'>,
          'tileVariant' | 'previewVariant' | 'editorVariant'
        >
      >
    )
  }
}

const finalizeNormalizedVerifiedMediaAsset = async (
  ctx: MutationCtx,
  asset: NormalizedVerifiedMediaAsset
): Promise<FinalizedUpload> =>
{
  const existing = await ctx.db
    .query('mediaAssets')
    .withIndex('byOwnerAndDedupeHash', (q) =>
      q.eq('ownerId', asset.userId).eq('dedupeHash', asset.dedupeHash)
    )
    .unique()

  if (existing)
  {
    await insertMissingVariants(ctx, existing._id, asset.variants)
    return {
      externalId: existing.externalId,
      mediaAssetId: existing._id,
    }
  }

  const externalId = generateMediaAssetExternalId()
  const mediaAssetId = await ctx.db.insert('mediaAssets', {
    ownerId: asset.userId,
    externalId,
    dedupeHash: asset.dedupeHash,
    ...buildVariantSummariesForInsert(asset.variants),
    createdAt: Date.now(),
  })
  await insertMissingVariants(ctx, mediaAssetId, asset.variants)

  return { externalId, mediaAssetId }
}

export const finalizeVerifiedMediaAsset = internalMutation({
  args: verifiedMediaAssetArgsValidator,
  returns: v.object({
    externalId: v.string(),
    mediaAssetId: v.id('mediaAssets'),
  }),
  handler: async (ctx, args): Promise<FinalizedUpload> =>
    await finalizeNormalizedVerifiedMediaAsset(
      ctx,
      normalizeVerifiedMediaAsset(args)
    ),
})

export const finalizeVerifiedMediaAssets = internalMutation({
  args: {
    assets: v.array(v.object(verifiedMediaAssetArgsValidator)),
  },
  returns: v.array(
    v.object({
      externalId: v.string(),
      mediaAssetId: v.id('mediaAssets'),
    })
  ),
  handler: async (ctx, args): Promise<FinalizedUpload[]> =>
  {
    const pendingByHash = new Map<string, Promise<FinalizedUpload>>()
    return await Promise.all(
      args.assets.map(async (assetArgs) =>
      {
        const asset = normalizeVerifiedMediaAsset(assetArgs)
        const pending = pendingByHash.get(asset.key)
        if (pending)
        {
          const result = await pending
          await deleteVariantStorageIds(ctx, asset.variants)
          return result
        }

        const next = finalizeNormalizedVerifiedMediaAsset(ctx, asset)
        pendingByHash.set(asset.key, next)
        return await next
      })
    )
  },
})

// is a media asset still referenced by any board/template/ranking row?
// shared between nightly orphan GC & the per-asset cascade path so new
// reference tables change one place
export const hasMediaAssetReferences = async (
  ctx: MutationCtx,
  mediaAssetId: Id<'mediaAssets'>
): Promise<boolean> =>
{
  const [boardRefs, templateItemRefs, templateCoverRefs, rankingItemRefs] =
    await Promise.all([
      ctx.db
        .query('boardItems')
        .withIndex('byMedia', (q) => q.eq('mediaAssetId', mediaAssetId))
        .take(1),
      ctx.db
        .query('templateItems')
        .withIndex('byMedia', (q) => q.eq('mediaAssetId', mediaAssetId))
        .take(1),
      ctx.db
        .query('templates')
        .withIndex('byCoverMedia', (q) =>
          q.eq('coverMediaAssetId', mediaAssetId)
        )
        .take(1),
      ctx.db
        .query('publishedRankingItems')
        .withIndex('byMedia', (q) => q.eq('mediaAssetId', mediaAssetId))
        .take(1),
    ])

  return (
    boardRefs.length > 0 ||
    templateItemRefs.length > 0 ||
    templateCoverRefs.length > 0 ||
    rankingItemRefs.length > 0
  )
}

export const deleteMediaAssetWithVariants = async (
  ctx: MutationCtx,
  mediaAssetId: Id<'mediaAssets'>
): Promise<void> =>
{
  const variants = await ctx.db
    .query('mediaVariants')
    .withIndex('byMediaAssetAndKind', (q) => q.eq('mediaAssetId', mediaAssetId))
    .take(MAX_VARIANT_ROWS_PER_ASSET)

  await Promise.all(
    variants.map(async (variant) =>
    {
      await ctx.db.delete(variant._id)
      await deleteStorageSilently(ctx, variant.storageId)
    })
  )
  await ctx.db.delete(mediaAssetId)
}

// reap mediaAssets rows w/ no surviving board/template/ranking references. paginates
// to stay inside the transaction row-read budget; self-schedules continuations
export const gcOrphanedMediaAssets = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    const cutoff = Date.now() - GC_GRACE_MS

    const page = await ctx.db.query('mediaAssets').paginate({
      numItems: BATCH_LIMITS.mediaGc,
      cursor: args.cursor,
    })

    const eligible: Doc<'mediaAssets'>[] = []
    for (const asset of page.page)
    {
      if (asset.createdAt > cutoff) continue
      eligible.push(asset)
    }

    const orphaned = (
      await runInChunks(eligible, REFERENCE_CHECK_CONCURRENCY, async (asset) =>
        (await hasMediaAssetReferences(ctx, asset._id)) ? null : asset
      )
    ).filter((asset): asset is Doc<'mediaAssets'> => asset !== null)

    await runInChunks(orphaned, REFERENCE_CHECK_CONCURRENCY, async (asset) =>
    {
      await deleteMediaAssetWithVariants(ctx, asset._id)
      return null
    })

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.platform.media.internal.gcOrphanedMediaAssets,
        { cursor: page.continueCursor }
      )
    }

    return { deleted: orphaned.length }
  },
})

const hasStorageReference = async (
  ctx: MutationCtx,
  storageId: Id<'_storage'>
): Promise<boolean> =>
{
  const [variantRefs, shortLinkRefs, avatarRefs] = await Promise.all([
    ctx.db
      .query('mediaVariants')
      .withIndex('byStorageId', (q) => q.eq('storageId', storageId))
      .take(1),
    ctx.db
      .query('shortLinks')
      .withIndex('bySnapshotStorageId', (q) =>
        q.eq('snapshotStorageId', storageId)
      )
      .take(1),
    ctx.db
      .query('users')
      .withIndex('byAvatarStorageId', (q) => q.eq('avatarStorageId', storageId))
      .take(1),
  ])

  return (
    variantRefs.length > 0 || shortLinkRefs.length > 0 || avatarRefs.length > 0
  )
}

// reap _storage blobs w/ no referencing row. use per-blob indexed lookups so
// continuations stay under scheduler arg limits
export const gcOrphanedStorage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    const cutoff = Date.now() - GC_GRACE_MS

    const page = await ctx.db.system.query('_storage').paginate({
      numItems: BATCH_LIMITS.storageGc,
      cursor: args.cursor,
    })

    const eligible = page.page.filter((blob) => blob._creationTime <= cutoff)
    const orphaned = (
      await runInChunks(eligible, REFERENCE_CHECK_CONCURRENCY, async (blob) =>
        (await hasStorageReference(ctx, blob._id)) ? null : blob._id
      )
    ).filter((storageId): storageId is Id<'_storage'> => storageId !== null)

    await runInChunks(
      orphaned,
      REFERENCE_CHECK_CONCURRENCY,
      async (storageId) =>
      {
        await deleteStorageSilently(ctx, storageId)
        return null
      }
    )

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.platform.media.internal.gcOrphanedStorage,
        { cursor: page.continueCursor }
      )
    }

    return { deleted: orphaned.length }
  },
})
