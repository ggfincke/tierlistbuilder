// convex/crons.ts
// scheduled jobs — top-level crons declaration for the convex deployment

import { cronJobs } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { BOARD_TOMBSTONE_RETENTION_MS } from '@tierlistbuilder/contracts/workspace/board'

const HARD_DELETE_SCHEDULE_BATCH = 64

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
        numItems: HARD_DELETE_SCHEDULE_BATCH,
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

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(0, internal.crons.scheduleHardDeletes, {
        cursor: page.continueCursor,
      })
    }

    return { scheduled: page.page.length }
  },
})

const crons = cronJobs()

crons.cron(
  'hard-delete expired soft-deleted boards',
  '17 3 * * *',
  internal.crons.scheduleHardDeletes,
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

// daily orphan _storage sweep — staggered after media GC to catch dropped uploads
// (anon snapshots, finalizeUpload that never fired) & residue from crashed GC passes.
// safety net for the whole storage-reference graph
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

export default crons
