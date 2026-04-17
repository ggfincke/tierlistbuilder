// convex/platform/shortLinks/internal.ts
// internal short-link maintenance jobs:
//   - gcExpiredShortLinks: paginated reap of shortLinks rows whose expiresAt
//     has passed. matches the shape of scheduleHardDeletes (cursor-driven
//     self-rescheduling) & gcOrphanedMediaAssets (per-row blob delete after
//     row delete). PR 7-era rows w/ expiresAt === null are persistent by
//     their original contract & the byExpiresAt index naturally skips them

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

const EXPIRED_LINK_BATCH_SIZE = 64

// reap shortLinks rows past their expiresAt + the matching _storage blob.
// row delete commits first, then storage delete is best-effort. a crash
// between the two leaves an orphaned blob — caught by the daily
// gcOrphanedStorage pass which already walks shortLinks for its reachability
// set, so the orphan is detected on its first run after the crash. the
// inverse order (blob first, row second) would leave a row pointing at a
// missing blob w/ no automatic recovery
export const gcExpiredShortLinks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    // gt(0) is a half-open range that excludes both expiresAt === null (the
    // index skips nulls) & expiresAt === 0. createSnapshotShortLink always
    // sets expiresAt to now + DEFAULT_SHARE_LINK_TTL_MS (>>> 0), so this
    // never excludes a real share. lt(now) bounds the range to expired rows
    const now = Date.now()
    const page = await ctx.db
      .query('shortLinks')
      .withIndex('byExpiresAt', (q) =>
        q.gt('expiresAt', 0).lt('expiresAt', now)
      )
      .paginate({
        numItems: EXPIRED_LINK_BATCH_SIZE,
        cursor: args.cursor,
      })

    let deleted = 0
    for (const row of page.page)
    {
      const storageId = row.snapshotStorageId
      await ctx.db.delete(row._id)
      try
      {
        await ctx.storage.delete(storageId)
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
        internal.platform.shortLinks.internal.gcExpiredShortLinks,
        { cursor: page.continueCursor }
      )
    }

    return { deleted }
  },
})
