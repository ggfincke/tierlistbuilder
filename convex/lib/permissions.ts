// convex/lib/permissions.ts
// authorization helpers — ownership checks for boards, presets, & media

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

type BoardOwnershipCtx = QueryCtx | MutationCtx
type MediaOwnershipCtx = QueryCtx | MutationCtx

// resolve one owned board by externalId (including soft-deleted rows).
// callers that care about soft-deletes must filter themselves — most callers
// want findOwnedActiveBoardByExternalId instead
export const findOwnedBoardByExternalIdIncludingDeleted = async (
  ctx: BoardOwnershipCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'boards'> | null> =>
  await ctx.db
    .query('boards')
    .withIndex('byOwnerAndExternalId', (q) =>
      q.eq('ownerId', userId).eq('externalId', externalId)
    )
    .unique()

// resolve one owned active (non-soft-deleted) board by externalId. returns
// null for both "never existed" & "soft-deleted" cases — callers that need
// to distinguish those should use the includesDeleted variant
export const findOwnedActiveBoardByExternalId = async (
  ctx: BoardOwnershipCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'boards'> | null> =>
{
  const board = await findOwnedBoardByExternalIdIncludingDeleted(
    ctx,
    externalId,
    userId
  )
  return board && board.deletedAt === null ? board : null
}

// assert the caller owns the board resolved from an externalId. matches the
// includesDeleted variant so callers (e.g. the delete mutation) can make
// their own call about what to do w/ a soft-deleted row
export const requireBoardOwnershipByExternalId = async (
  ctx: BoardOwnershipCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'boards'>> =>
{
  const board = await findOwnedBoardByExternalIdIncludingDeleted(
    ctx,
    externalId,
    userId
  )

  if (!board)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'board not found',
    })
  }

  return board
}

// resolve one owned media asset by externalId, or null if it doesn't exist
export const findOwnedMediaAssetByExternalId = async (
  ctx: MediaOwnershipCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'mediaAssets'> | null> =>
  await ctx.db
    .query('mediaAssets')
    .withIndex('byOwnerAndExternalId', (q) =>
      q.eq('ownerId', userId).eq('externalId', externalId)
    )
    .unique()

// resolve one owned preset by externalId, or null if it doesn't exist for
// this owner. mirrors findOwnedActiveBoardByExternalId — preset rows have
// no soft-delete, so the "active" qualifier from boards doesn't apply
export const findOwnedTierPresetByExternalId = async (
  ctx: QueryCtx | MutationCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'tierPresets'> | null> =>
  await ctx.db
    .query('tierPresets')
    .withIndex('byOwnerAndExternalId', (q) =>
      q.eq('ownerId', userId).eq('externalId', externalId)
    )
    .unique()

// assert the caller owns the preset resolved from an externalId
export const requireTierPresetOwnershipByExternalId = async (
  ctx: QueryCtx | MutationCtx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'tierPresets'>> =>
{
  const preset = await findOwnedTierPresetByExternalId(ctx, externalId, userId)
  if (!preset)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'preset not found',
    })
  }
  return preset
}
