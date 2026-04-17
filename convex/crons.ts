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
  handler: async (ctx, args): Promise<{ scheduled: number }> =>
  {
    const cutoff = Date.now() - BOARD_TOMBSTONE_RETENTION_MS
    // gt(0) is a half-open range that excludes both deletedAt === null (the
    // index skips nulls) & deletedAt === 0. in practice deleteBoard sets
    // deletedAt to Date.now() which is always >>> 0, so this never excludes
    // a real soft-delete. the lt(cutoff) bound keeps recently-deleted rows
    // past the retention window
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

// daily orphan media GC — staggered an hour after the board hard-delete pass
// so cascadeDeleteBoard has time to drain its boardItems phase first. running
// in this order means the GC catches assets that were just orphaned by the
// board cascade in the same nightly window
crons.cron(
  'gc orphaned media assets',
  '17 4 * * *',
  internal.platform.media.internal.gcOrphanedMediaAssets,
  { cursor: null }
)

// daily orphan _storage sweep — staggered another hour after media GC so it
// picks up blobs from dropped uploads (anon snapshot uploads, finalizeUpload
// that never fired) plus anything left behind by a crashed media GC pass.
// safety net for the whole storage-reference graph
crons.cron(
  'gc orphaned storage blobs',
  '17 5 * * *',
  internal.platform.media.internal.gcOrphanedStorage,
  { cursor: null }
)

export default crons
