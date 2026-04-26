// convex/platform/media/internal.ts
// internal media functions: finalizeVerifiedUpload (post-action dedup-&-insert),
// gcOrphanedMediaAssets (unreferenced mediaAssets), gcOrphanedStorage (residue)

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { BATCH_LIMITS } from '../../lib/limits'
import { generateMediaAssetExternalId } from '@tierlistbuilder/contracts/lib/ids'
import { deleteStorageSilently } from '../../lib/storage'

// in-flight upload protection: skip rows newer than this window. covers the race
// between finalizeUpload inserting mediaAssets & upsertBoardState wiring the reference -
// a GC pass between those two would otherwise reap a fresh asset
const GC_GRACE_MS = 60 * 60 * 1000

// concurrency for per-asset reference checks. media-reference indexes are
// independent across assets so bounded parallelism cuts wall clock
// significantly for nightly batches
const REFERENCE_CHECK_CONCURRENCY = 8

// finalize a verified image upload — dedup by owner+hash after the action has
// stripped the upload envelope & stored a clean image blob
export const finalizeVerifiedUpload = internalMutation({
  args: {
    userId: v.id('users'),
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
  returns: v.object({ externalId: v.string() }),
  handler: async (ctx, args): Promise<{ externalId: string }> =>
  {
    const existing = await ctx.db
      .query('mediaAssets')
      .withIndex('byOwnerAndHash', (q) =>
        q.eq('ownerId', args.userId).eq('contentHash', args.contentHash)
      )
      .unique()

    if (existing)
    {
      await deleteStorageSilently(ctx, args.storageId)
      return { externalId: existing.externalId }
    }

    const externalId = generateMediaAssetExternalId()
    await ctx.db.insert('mediaAssets', {
      ownerId: args.userId,
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

// reap mediaAssets rows w/ no surviving boardItems references. paginates to stay
// inside the transaction row-read budget; self-schedules continuations. row deleted
// before storage blob so a crash leaves only an orphaned blob — caught by gcOrphanedStorage
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

    // partition: retain fresh rows (grace window) & check the rest in parallel
    const eligible: Doc<'mediaAssets'>[] = []
    for (const asset of page.page)
    {
      if (asset.createdAt > cutoff) continue
      eligible.push(asset)
    }

    // parallel reachability checks via chunked Promise.all — respects
    // REFERENCE_CHECK_CONCURRENCY to avoid fan-out that would spike reads
    const orphaned: Doc<'mediaAssets'>[] = []
    for (let i = 0; i < eligible.length; i += REFERENCE_CHECK_CONCURRENCY)
    {
      const chunk = eligible.slice(i, i + REFERENCE_CHECK_CONCURRENCY)
      const flags = await Promise.all(
        chunk.map(async (asset) =>
        {
          const [
            boardRefs,
            boardSourceRefs,
            templateItemRefs,
            templateCoverRefs,
          ] = await Promise.all([
            ctx.db
              .query('boardItems')
              .withIndex('byMedia', (q) => q.eq('mediaAssetId', asset._id))
              .take(1),
            ctx.db
              .query('boardItems')
              .withIndex('bySourceMedia', (q) =>
                q.eq('sourceMediaAssetId', asset._id)
              )
              .take(1),
            ctx.db
              .query('templateItems')
              .withIndex('byMedia', (q) => q.eq('mediaAssetId', asset._id))
              .take(1),
            ctx.db
              .query('templates')
              .withIndex('byCoverMedia', (q) =>
                q.eq('coverMediaAssetId', asset._id)
              )
              .take(1),
          ])

          return (
            boardRefs.length === 0 &&
            boardSourceRefs.length === 0 &&
            templateItemRefs.length === 0 &&
            templateCoverRefs.length === 0
          )
        })
      )
      for (let j = 0; j < chunk.length; j++)
      {
        if (flags[j]) orphaned.push(chunk[j])
      }
    }

    let deleted = 0
    for (const asset of orphaned)
    {
      // row first so gcOrphanedStorage can find & reap residue if the blob
      // delete fails or a crash happens between the two ops
      await ctx.db.delete(asset._id)
      await deleteStorageSilently(ctx, asset.storageId)
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

// check whether any app table still references a storage blob. use indexes so
// each lookup stays bounded & the scheduler continuation only needs a cursor
const hasStorageReference = async (
  ctx: MutationCtx,
  storageId: Id<'_storage'>
): Promise<boolean> =>
{
  const [assetRefs, shortLinkRefs, avatarRefs] = await Promise.all([
    ctx.db
      .query('mediaAssets')
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
    assetRefs.length > 0 || shortLinkRefs.length > 0 || avatarRefs.length > 0
  )
}

// reap _storage blobs w/ no referencing row - safety net for gcOrphanedMediaAssets.
// use per-blob indexed lookups so continuations stay under scheduler arg limits
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
