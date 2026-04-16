// convex/crons.ts
// scheduled jobs — top-level crons declaration for the convex deployment

import { cronJobs } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'

const BOARD_HARD_DELETE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
const HARD_DELETE_SCHEDULE_BATCH = 64

// schedule hard-deletes for boards past the soft-delete retention window
export const scheduleHardDeletes = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ scheduled: number }> =>
  {
    const cutoff = Date.now() - BOARD_HARD_DELETE_AFTER_MS
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

export default crons
