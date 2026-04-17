// convex/platform/media/internal.ts
// internal media maintenance jobs:
//   - gcOrphanedMediaAssets: reaps mediaAssets rows whose last referencing
//     boardItems row has been deleted (typically by a board cascade-delete
//     or user removing every item that pointed at a given image)
//   - gcOrphanedStorage: reaps raw _storage blobs w/ no referencing row in
//     any of mediaAssets, shortLinks, or users.avatarStorageId. covers
//     upload URLs that landed a blob but whose follow-up mutation dropped
//     (network failure, client navigation, rate-abuse uploads, etc.)

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'

const MEDIA_GC_BATCH_SIZE = 64
const STORAGE_GC_BATCH_SIZE = 64

// in-flight upload protection: any row newer than this window is skipped.
// covers the race between finalizeUpload landing the row & the first board-
// state upsert wiring it into a boardItems entry — the upload step inserts
// mediaAssets first, then the client follows up w/ a separate upsertBoardState
// mutation, so a GC pass between those two transactions would otherwise reap
// a fresh asset before the reference materialized. same window protects
// shortLinks blob uploads that haven't yet called createSnapshotShortLink
const GC_GRACE_MS = 60 * 60 * 1000

// concurrency for per-asset reference checks. byMedia index queries are
// independent across assets so bounded parallelism cuts wall clock
// significantly for nightly batches
const REFERENCE_CHECK_CONCURRENCY = 8

// reap mediaAssets rows w/ no surviving boardItems references. paginates
// across the full table so a single invocation stays inside a single
// transaction's row-read budget; a continuation is scheduled when more
// pages remain. delete order is storage blob first, then mediaAssets row,
// so a crash between the two leaves only an orphaned _storage entry that
// the next pass cleans up via gcOrphanedStorage
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

    // parallel reachability checks — each byMedia.take(1) is cheap &
    // independent. kept as a chunked Promise.all (not full map) to respect
    // the REFERENCE_CHECK_CONCURRENCY bound & avoid fan-out that would spike
    // the function's read budget
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
      await ctx.storage.delete(asset.storageId)
      await ctx.db.delete(asset._id)
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

// build the set of _storage ids referenced by any app table. called per GC
// batch — cheap for the current table sizes (all three tables combined are
// bounded by user count + per-user asset count, which stays in 10^6 range
// for the foreseeable future). if this becomes hot, cache across runs via
// a dedicated referenceIndex table
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

// reap _storage blobs w/ no referencing row. paginates the system _storage
// table so a single invocation stays inside the transaction budget; follow-up
// runs are self-scheduled. grace window protects fresh uploads whose linking
// mutation (finalizeUpload, createSnapshotShortLink, avatar upsert) hasn't
// fired yet. designed to be a safety net for gcOrphanedMediaAssets — even
// if the media GC fails between storage.delete & db.delete, this pass
// eventually catches the residual blob
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
