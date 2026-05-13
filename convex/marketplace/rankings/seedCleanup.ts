// convex/marketplace/rankings/seedCleanup.ts
// bounded cascade deletes for seed-owned rankings & their companion boards.

// callers keep child counts within SEED_LIMITS so each cascade fits in a single
// mutation; convex/lib/cascadeDelete.ts handles unbounded cleanup via the scheduler.

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import { SEED_LIMITS } from '../../lib/limits'

const assertWithinSeedLimit = (
  rows: readonly unknown[],
  limit: number,
  message: string
): void =>
{
  if (rows.length > limit)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message,
    })
  }
}

export const deleteSeedRankingWithChildren = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('publishedRankingItems')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(SEED_LIMITS.rankingSeedItemsPerRanking + 1),
    ctx.db
      .query('publishedRankingTiers')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(SEED_LIMITS.rankingSeedTiersPerRanking + 1),
  ])
  assertWithinSeedLimit(
    items,
    SEED_LIMITS.rankingSeedItemsPerRanking,
    'seed ranking item rows exceed cleanup limit'
  )
  assertWithinSeedLimit(
    tiers,
    SEED_LIMITS.rankingSeedTiersPerRanking,
    'seed ranking tier rows exceed cleanup limit'
  )
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(ranking._id),
  ])
}

export const deleteSeedBoardWithChildren = async (
  ctx: MutationCtx,
  board: Doc<'boards'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', board._id))
      .take(SEED_LIMITS.rankingSeedItemsPerRanking + 1),
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', board._id))
      .take(SEED_LIMITS.rankingSeedTiersPerRanking + 1),
  ])
  assertWithinSeedLimit(
    items,
    SEED_LIMITS.rankingSeedItemsPerRanking,
    'seed board item rows exceed cleanup limit'
  )
  assertWithinSeedLimit(
    tiers,
    SEED_LIMITS.rankingSeedTiersPerRanking,
    'seed board tier rows exceed cleanup limit'
  )
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(board._id),
  ])
}
