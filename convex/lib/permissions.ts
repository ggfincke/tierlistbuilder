// convex/lib/permissions.ts
// authorization helpers — ownership checks for user-owned rows

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { findRankingBySlug, findTemplateBySlug } from './marketplaceLookups'

type Ctx = QueryCtx | MutationCtx

// raise a 404 ConvexError when a lookup returns null. keeps require* helpers
// to a one-liner over their find* counterparts
const orThrowNotFound = <T>(doc: T | null, label: string): T =>
{
  if (!doc)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `${label} not found`,
    })
  }
  return doc
}

// raise a 404 (not 403) when a slug-addressable row exists but isn't owned by
// the caller. avoids leaking the existence of someone else's unpublished row
const throwNotFoundForOwnership = (label: string): never =>
{
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.notFound,
    message: `${label} not found`,
  })
}

// resolve one owned board by externalId (including soft-deleted rows).
// callers that care about soft-deletes must filter themselves — most callers
// want findOwnedActiveBoardByExternalId instead
export const findOwnedBoardByExternalIdIncludingDeleted = async (
  ctx: Ctx,
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
  ctx: Ctx,
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
  ctx: Ctx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'boards'>> =>
  orThrowNotFound(
    await findOwnedBoardByExternalIdIncludingDeleted(ctx, externalId, userId),
    'board'
  )

// resolve one owned media asset by externalId, or null if it doesn't exist
export const findOwnedMediaAssetByExternalId = async (
  ctx: Ctx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'mediaAssets'> | null> =>
  await ctx.db
    .query('mediaAssets')
    .withIndex('byOwnerAndExternalId', (q) =>
      q.eq('ownerId', userId).eq('externalId', externalId)
    )
    .unique()

// FOOTGUN: returns the row regardless of owner. callers MUST follow up w/ an
// ownership/reachability check (canReadMediaAsset, or `asset.ownerId === userId`)
// — prefer findOwnedMediaAssetByExternalId above when an owner scope is known
export const findMediaAssetByExternalId = async (
  ctx: Ctx,
  externalId: string
): Promise<Doc<'mediaAssets'> | null> =>
  await ctx.db
    .query('mediaAssets')
    .withIndex('byExternalId', (q) => q.eq('externalId', externalId))
    .unique()

// resolve one owned preset by externalId, or null if it doesn't exist for
// this owner. preset rows have no soft-delete, so the "active" qualifier
// from boards doesn't apply
export const findOwnedTierPresetByExternalId = async (
  ctx: Ctx,
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
  ctx: Ctx,
  externalId: string,
  userId: Id<'users'>
): Promise<Doc<'tierPresets'>> =>
  orThrowNotFound(
    await findOwnedTierPresetByExternalId(ctx, externalId, userId),
    'preset'
  )

export const requireOwnedTemplate = async (
  ctx: Ctx,
  slug: string,
  userId: Id<'users'>
): Promise<Doc<'templates'>> =>
{
  const template = orThrowNotFound(
    await findTemplateBySlug(ctx, slug),
    'template'
  )
  if (template.authorId !== userId)
  {
    throwNotFoundForOwnership('template')
  }
  return template
}

export const requireOwnedRanking = async (
  ctx: Ctx,
  slug: string,
  userId: Id<'users'>
): Promise<Doc<'publishedRankings'>> =>
{
  const ranking = orThrowNotFound(await findRankingBySlug(ctx, slug), 'ranking')
  if (ranking.ownerId !== userId)
  {
    throwNotFoundForOwnership('ranking')
  }
  return ranking
}
