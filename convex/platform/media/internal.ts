// convex/platform/media/internal.ts
// internal media maintenance — gcOrphanedMediaAssets reaps mediaAssets w/ no boardItems
// reference; gcOrphanedStorage reaps _storage blobs w/ no row in any app table

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'

const MEDIA_GC_BATCH_SIZE = 64
const STORAGE_GC_BATCH_SIZE = 64

// in-flight upload protection: skip rows newer than this window. covers the race
// between finalizeUpload inserting mediaAssets & upsertBoardState wiring the reference -
// a GC pass between those two would otherwise reap a fresh asset
const GC_GRACE_MS = 60 * 60 * 1000

// concurrency for per-asset reference checks. byMedia index queries are
// independent across assets so bounded parallelism cuts wall clock
// significantly for nightly batches
const REFERENCE_CHECK_CONCURRENCY = 8

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
      numItems: MEDIA_GC_BATCH_SIZE,
      cursor: args.cursor,
    })

    // partition: retain fresh rows (grace window) & check the rest in parallel
    const eligible: Doc<'mediaAssets'>[] = []
    for (const asset of page.page)
    {
      if (asset.createdAt > cutoff) continue
      eligible.push(asset)
    }

    // parallel reachability checks via chunked Promise.all — respects REFERENCE_CHECK_CONCURRENCY
    // to avoid fan-out that would spike the function's read budget
    const orphaned: Doc<'mediaAssets'>[] = []
    for (let i = 0; i < eligible.length; i += REFERENCE_CHECK_CONCURRENCY)
    {
      const chunk = eligible.slice(i, i + REFERENCE_CHECK_CONCURRENCY)
      const flags = await Promise.all(
        chunk.map(async (asset) =>
        {
          const referenced = await ctx.db
            .query('boardItems')
            .withIndex('byMedia', (q) => q.eq('mediaAssetId', asset._id))
            .take(1)
          return referenced.length === 0
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
      try
      {
        await ctx.storage.delete(asset.storageId)
      }
      catch
      {
        // blob already gone (manual cleanup, race w/ a prior crashed pass).
        // row delete already committed, so the orphan-storage GC will pick
        // up any residue on its next run. nothing to surface here
      }
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
      numItems: STORAGE_GC_BATCH_SIZE,
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
      await ctx.storage.delete(storageId)
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
