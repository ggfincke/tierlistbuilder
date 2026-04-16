// convex/lib/permissions.ts
// authorization helpers — ownership checks for boards, presets, & media

import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

type BoardOwnershipCtx = QueryCtx | MutationCtx

// assert the caller owns the given board — throws if not found or not theirs
export const requireBoardOwnership = async (
  ctx: BoardOwnershipCtx,
  boardId: Id<'boards'>,
  userId: Id<'users'>
): Promise<Doc<'boards'>> =>
{
  const board = await ctx.db.get(boardId)
  if (!board)
  {
    throw new Error('board not found')
  }
  if (board.ownerId !== userId)
  {
    throw new Error('forbidden: caller does not own board')
  }
  return board
}

// assert the caller owns the board resolved from an externalId
export const requireBoardOwnershipByExternalId = async (
  ctx: BoardOwnershipCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'boards'>> =>
{
  const board = await ctx.db
    .query('boards')
    .withIndex('byExternalId', (q) => q.eq('externalId', externalId))
    .unique()

  if (!board)
  {
    throw new Error('board not found')
  }

  if (board.ownerId !== userId)
  {
    throw new Error('forbidden: caller does not own board')
  }

  return board
}

// assert the caller owns the given preset — throws if not found or not theirs
export const requireTierPresetOwnership = async (
  ctx: QueryCtx,
  presetId: Id<'tierPresets'>,
  userId: Id<'users'>
): Promise<Doc<'tierPresets'>> =>
{
  const preset = await ctx.db.get(presetId)
  if (!preset)
  {
    throw new Error('preset not found')
  }
  if (preset.ownerId !== userId)
  {
    throw new Error('forbidden: caller does not own preset')
  }
  return preset
}
