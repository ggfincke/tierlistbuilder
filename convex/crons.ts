// convex/crons.ts
// scheduled jobs — top-level crons declaration for the convex deployment

import { cronJobs } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { BOARD_TOMBSTONE_RETENTION_MS } from '@tierlistbuilder/contracts/workspace/board'
import { BATCH_LIMITS } from './lib/limits'
import { rescheduleIfMore } from './lib/scheduler'

// schedule hard-deletes for boards past the soft-delete retention window
export const scheduleHardDeletes = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, args): Promise<{ scheduled: number }> =>
  {
    const cutoff = Date.now() - BOARD_TOMBSTONE_RETENTION_MS
    // gt(0) excludes deletedAt === null (index skips nulls) & === 0 (never set in practice).
    // lt(cutoff) bounds the range to rows past the retention window
    const page = await ctx.db
      .query('boards')
      .withIndex('byDeletedAt', (q) =>
        q.gt('deletedAt', 0).lt('deletedAt', cutoff)
      )
      .paginate({
        numItems: BATCH_LIMITS.hardDeleteSchedule,
        cursor: args.cursor,
      })

    await Promise.all(
      page.page.map((board) =>
        ctx.scheduler.runAfter(
          0,
          internal.workspace.boards.internal.cascadeDeleteBoard,
          { boardId: board._id }
        )
      )
    )

    await rescheduleIfMore(ctx, page, internal.crons.scheduleHardDeletes, {})

    return { scheduled: page.page.length }
  },
})

// hard-delete aged item tombstones on live boards — without this sweep,
// boardItems soft-deletes on churned boards accumulate past the
// loadBoundedBoardRows take limit (BOARD_ITEM_TAKE_LIMIT) & strand the board
export const gcDeletedBoardItems = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    const cutoff = Date.now() - BOARD_TOMBSTONE_RETENTION_MS
    // gt(0) skips active rows (deletedAt === null) & the never-used 0 sentinel;
    // lt(cutoff) bounds the range to tombstones past the retention window
    const page = await ctx.db
      .query('boardItems')
      .withIndex('byDeletedAt', (q) =>
        q.gt('deletedAt', 0).lt('deletedAt', cutoff)
      )
      .paginate({
        numItems: BATCH_LIMITS.itemTombstoneGc,
        cursor: args.cursor,
      })

    await Promise.all(page.page.map((item) => ctx.db.delete(item._id)))

    await rescheduleIfMore(ctx, page, internal.crons.gcDeletedBoardItems, {})

    return { deleted: page.page.length }
  },
})

const crons = cronJobs()

crons.cron(
  'hard-delete expired soft-deleted boards',
  '17 3 * * *',
  internal.crons.scheduleHardDeletes,
  { cursor: null }
)

// item-tombstone sweep — staggered before the board hard-delete so it operates
// on live boards only (dead boards' items are removed by cascadeDeleteBoard)
crons.cron(
  'gc aged board item tombstones',
  '17 2 * * *',
  internal.crons.gcDeletedBoardItems,
  { cursor: null }
)

// daily orphan media GC — staggered an hour after board hard-delete so cascadeDeleteBoard
// drains its boardItems phase first, letting the GC catch freshly-orphaned assets in
// the same nightly window
crons.cron(
  'gc orphaned media assets',
  '17 4 * * *',
  internal.platform.media.internal.gcOrphanedMediaAssets,
  { cursor: null }
)

// daily orphan _storage sweep — staggered after media GC to catch dropped
// uploads (finalizeUpload that never fired) & leftovers from crashed GC
// passes. safety net for the whole storage graph
crons.cron(
  'gc orphaned storage blobs',
  '17 5 * * *',
  internal.platform.media.internal.gcOrphanedStorage,
  { cursor: null }
)

// daily snapshot-share TTL sweep — staggered last so prior crons drain first.
// shortLinks rows & matching _storage blobs deleted in-band; gcOrphanedStorage
// catches any partial-failure residue on its next run
crons.cron(
  'gc expired snapshot share links',
  '17 6 * * *',
  internal.platform.shortLinks.internal.gcExpiredShortLinks,
  { cursor: null }
)

crons.interval(
  'recompute template trending scores',
  { hours: 4 },
  internal.marketplace.templates.internal.recomputeTemplateTrendingScores,
  { cursor: null }
)

crons.interval(
  'schedule template ranking aggregate recomputes',
  { hours: 2 },
  internal.marketplace.rankings.aggregate.jobs
    .scheduleTemplateRankingAggregateRecomputes,
  { cursor: null }
)

crons.interval(
  'retry stale template ranking aggregate jobs',
  { hours: 1 },
  internal.marketplace.rankings.aggregate.jobs
    .retryStaleTemplateRankingAggregateJobs,
  { cursor: null }
)

export default crons
