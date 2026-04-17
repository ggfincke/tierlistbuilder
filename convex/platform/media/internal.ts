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
// between finalizeUpload inserting mediaAssets & upsertBoardState wiring the reference —
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
      if ((asset.createdAt ?? 0) > cutoff) continue
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

// build the set of _storage ids referenced by any app table. cheap for current
// table sizes (bounded by user count × per-user assets, ~10^6 range). cache via
// a referenceIndex table if this becomes hot
const collectReferencedStorageIds = async (
  ctx: MutationCtx
): Promise<Set<Id<'_storage'>>> =>
{
  const referenced = new Set<Id<'_storage'>>()

  for await (const asset of ctx.db.query('mediaAssets'))
  {
    referenced.add(asset.storageId)
  }

  for await (const link of ctx.db.query('shortLinks'))
  {
    referenced.add(link.snapshotStorageId)
  }

  for await (const user of ctx.db.query('users'))
  {
    if (user.avatarStorageId)
    {
      referenced.add(user.avatarStorageId)
    }
  }

  return referenced
}

// reap _storage blobs w/ no referencing row. paginates _storage & self-schedules
// continuations. grace window protects fresh uploads whose linking mutation hasn't fired.
// safety net for gcOrphanedMediaAssets — catches residual blobs from partial failures
export const gcOrphanedStorage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    const cutoff = Date.now() - GC_GRACE_MS

    const page = await ctx.db.system.query('_storage').paginate({
      numItems: STORAGE_GC_BATCH_SIZE,
      cursor: args.cursor,
    })

    const referenced =
      page.page.length > 0
        ? await collectReferencedStorageIds(ctx)
        : new Set<Id<'_storage'>>()

    let deleted = 0
    for (const blob of page.page)
    {
      // convex system _storage table — _creationTime is the insertion wall
      // clock in millis, which doubles as the in-flight grace window
      if (blob._creationTime > cutoff) continue
      if (referenced.has(blob._id)) continue

      await ctx.storage.delete(blob._id)
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
