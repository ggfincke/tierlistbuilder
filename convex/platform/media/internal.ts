// convex/platform/media/internal.ts
// internal media functions: finalize verified variants & reap unreachable assets

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { BATCH_LIMITS } from '../../lib/limits'
import { generateMediaAssetExternalId } from '@tierlistbuilder/contracts/lib/ids'
import { deleteStorageSilently } from '../../lib/storage'
import {
  MAX_MEDIA_VARIANTS_PER_ASSET,
  MEDIA_VARIANT_KINDS,
  type MediaVariantKind,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import type { MediaVariantSummary } from '../../lib/mediaVariants'
import {
  imageMimeTypeValidator,
  mediaVariantKindValidator,
} from '../../lib/validators'

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
    throw new Error(
      `media asset finalization requires 1..${MAX_MEDIA_VARIANTS_PER_ASSET} variants`
    )
  }

  const byKind = new Map<MediaVariantKind, VerifiedVariantArgs>()
  for (const variant of variants)
  {
    if (byKind.has(variant.kind))
    {
      throw new Error(`duplicate media variant kind: ${variant.kind}`)
    }
    byKind.set(variant.kind, variant)
  }

  const tile = byKind.get('tile')
  if (!tile)
  {
    throw new Error('media asset finalization requires a tile variant')
  }

  const normalizedVariants = [...byKind.values()]
  const dedupeHash = normalizedVariants
    .map((variant) => `${variant.kind}:${variant.contentHash}`)
    .sort()
    .join('|')
  return { variants: normalizedVariants, dedupeHash }
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
  for (const variant of variants)
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
      continue
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
    await ctx.db.patch(mediaAssetId, {
      [VARIANT_FIELD_BY_KIND[variant.kind]]: toMediaVariantSummary(variant),
    })
  }
}

const finalizeVerifiedMediaAssetImpl = async (
  ctx: MutationCtx,
  args: VerifiedMediaAssetArgs,
  finalizedByHash: Map<string, FinalizedUpload>
): Promise<FinalizedUpload> =>
{
  const { variants, dedupeHash } = normalizeVerifiedVariants(args.variants)
  const key = `${args.userId}:${dedupeHash}`
  const finalized = finalizedByHash.get(key)
  if (finalized)
  {
    await deleteVariantStorageIds(ctx, variants)
    return finalized
  }

  const existing = await ctx.db
    .query('mediaAssets')
    .withIndex('byOwnerAndDedupeHash', (q) =>
      q.eq('ownerId', args.userId).eq('dedupeHash', dedupeHash)
    )
    .unique()

  if (existing)
  {
    await insertMissingVariants(ctx, existing._id, variants)
    const result = {
      externalId: existing.externalId,
      mediaAssetId: existing._id,
    }
    finalizedByHash.set(key, result)
    return result
  }

  const externalId = generateMediaAssetExternalId()
  const mediaAssetId = await ctx.db.insert('mediaAssets', {
    ownerId: args.userId,
    externalId,
    dedupeHash,
    ...buildVariantSummariesForInsert(variants),
    createdAt: Date.now(),
  })
  await insertMissingVariants(ctx, mediaAssetId, variants)

  const result = { externalId, mediaAssetId }
  finalizedByHash.set(key, result)
  return result
}

export const finalizeVerifiedMediaAsset = internalMutation({
  args: verifiedMediaAssetArgsValidator,
  returns: v.object({
    externalId: v.string(),
    mediaAssetId: v.id('mediaAssets'),
  }),
  handler: async (ctx, args): Promise<FinalizedUpload> =>
    await finalizeVerifiedMediaAssetImpl(ctx, args, new Map()),
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
    const finalizedByHash = new Map<string, FinalizedUpload>()
    const results: FinalizedUpload[] = []
    for (const asset of args.assets)
    {
      results.push(
        await finalizeVerifiedMediaAssetImpl(ctx, asset, finalizedByHash)
      )
    }
    return results
  },
})

// is a media asset still referenced by any board item, template item, or
// template cover? shared between nightly orphan GC & the per-asset cascade
// path so adding a fourth reference table changes one place
export const hasMediaAssetReferences = async (
  ctx: MutationCtx,
  mediaAssetId: Id<'mediaAssets'>
): Promise<boolean> =>
{
  const [boardRefs, templateItemRefs, templateCoverRefs] = await Promise.all([
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
      .withIndex('byCoverMedia', (q) => q.eq('coverMediaAssetId', mediaAssetId))
      .take(1),
  ])
  return (
    boardRefs.length > 0 ||
    templateItemRefs.length > 0 ||
    templateCoverRefs.length > 0
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

  for (const variant of variants)
  {
    await ctx.db.delete(variant._id)
    await deleteStorageSilently(ctx, variant.storageId)
  }
  await ctx.db.delete(mediaAssetId)
}

// reap mediaAssets rows w/ no surviving board/template references. paginates
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

    const orphaned: Doc<'mediaAssets'>[] = []
    for (let i = 0; i < eligible.length; i += REFERENCE_CHECK_CONCURRENCY)
    {
      const chunk = eligible.slice(i, i + REFERENCE_CHECK_CONCURRENCY)
      const isOrphaned = await Promise.all(
        chunk.map(
          async (asset) => !(await hasMediaAssetReferences(ctx, asset._id))
        )
      )
      for (let j = 0; j < chunk.length; j++)
      {
        if (isOrphaned[j]) orphaned.push(chunk[j])
      }
    }

    let deleted = 0
    for (const asset of orphaned)
    {
      await deleteMediaAssetWithVariants(ctx, asset._id)
      deleted++
    }

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.platform.media.internal.gcOrphanedMediaAssets,
        { cursor: page.continueCursor }
      )
    }

    return { deleted }
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
    const orphaned: Id<'_storage'>[] = []

    for (let i = 0; i < eligible.length; i += REFERENCE_CHECK_CONCURRENCY)
    {
      const chunk = eligible.slice(i, i + REFERENCE_CHECK_CONCURRENCY)
      const flags = await Promise.all(
        chunk.map(async (blob) => !(await hasStorageReference(ctx, blob._id)))
      )

      for (let j = 0; j < chunk.length; j++)
      {
        if (flags[j]) orphaned.push(chunk[j]._id)
      }
    }

    let deleted = 0
    for (const storageId of orphaned)
    {
      await deleteStorageSilently(ctx, storageId)
      deleted++
    }

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.platform.media.internal.gcOrphanedStorage,
        { cursor: page.continueCursor }
      )
    }

    return { deleted }
  },
})
