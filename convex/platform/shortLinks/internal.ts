// convex/platform/shortLinks/internal.ts
// internal short-link maintenance — gcExpiredShortLinks: paginated reap of rows past
// expiresAt. cursor-driven self-rescheduling; row deleted before blob; null rows skipped

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

const EXPIRED_LINK_BATCH_SIZE = 64

// reap shortLinks rows past expiresAt + matching _storage blob. row deleted first
// so a crash leaves only an orphaned blob — caught by the daily gcOrphanedStorage pass.
// inverse order (blob first) would leave a row pointing at a missing blob
export const gcExpiredShortLinks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    // gt(0) excludes expiresAt === null (index skips nulls) & === 0 (never set in practice).
    // lt(now) bounds the range to expired rows
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
