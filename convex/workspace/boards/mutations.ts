// convex/workspace/boards/mutations.ts
// board mutations — create, rename, & soft-delete owned boards

import { v } from 'convex/values'
import { mutation } from '../../_generated/server'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
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

// soft-delete an owned board
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
