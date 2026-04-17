// convex/workspace/boards/mutations.ts
// board mutations — create, rename, & soft-delete owned boards

import { ConvexError, v } from 'convex/values'
import { mutation } from '../../_generated/server'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { internal } from '../../_generated/api'
import { requireCurrentUserId } from '../../lib/auth'
import { newBoardExternalId } from '../../lib/ids'
import { requireBoardOwnershipByExternalId } from '../../lib/permissions'

// create a new empty board for the authenticated caller
export const createBoard = mutation({
  args: { title: v.string() },
  handler: async (ctx, args): Promise<{ externalId: string }> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const now = Date.now()
    const externalId = newBoardExternalId()

    await ctx.db.insert('boards', {
      externalId,
      ownerId: userId,
      title: normalizeBoardTitle(args.title),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 0,
    })

    return { externalId }
  },
})

// rename an existing owned board
export const updateBoardMeta = mutation({
  args: {
    boardExternalId: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )

    if (board.deletedAt !== null)
    {
      throw new Error('cannot update a deleted board')
    }

    if (args.title === undefined)
    {
      return null
    }

    await ctx.db.patch(board._id, {
      title: normalizeBoardTitle(args.title),
      updatedAt: Date.now(),
    })

    return null
  },
})

// soft-delete an owned board. idempotent: a second call on an already-deleted
// row no-ops instead of refreshing the deletedAt stamp, so the retention
// cron's clock isn't restarted by repeated client-side delete attempts
export const deleteBoard = mutation({
  args: { boardExternalId: v.string() },
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )

    if (board.deletedAt !== null)
    {
      return null
    }

    await ctx.db.patch(board._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    })

    return null
  },
})

// restore a previously soft-deleted board. clears deletedAt & bumps updatedAt
// so the row sorts back to the top of getMyBoards. no-op for already-active rows
export const restoreBoard = mutation({
  args: { boardExternalId: v.string() },
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )

    if (board.deletedAt === null)
    {
      return null
    }

    await ctx.db.patch(board._id, {
      deletedAt: null,
      updatedAt: Date.now(),
    })

    return null
  },
})

// permanently delete an owned board, bypassing the retention cron. schedules
// cascadeDeleteBoard which walks items + tiers in batches; the board row is removed
// only after both child phases drain
export const permanentlyDeleteBoard = mutation({
  args: { boardExternalId: v.string() },
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )

    // require soft-delete before hard delete — matches the retention cron's gate.
    // callers wanting to skip the soft step should call deleteBoard first
    if (board.deletedAt === null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'cannot permanently delete an active board',
      })
    }

    await ctx.scheduler.runAfter(
      0,
      internal.workspace.boards.internal.cascadeDeleteBoard,
      { boardId: board._id }
    )

    return null
  },
})
