// convex/marketplace/seed/rankings/rows.ts
// shared seed-owned ranking row predicates & indexed lookups

import { ConvexError } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { SeedRankingReleaseStatus } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { SEED_LIMITS } from '../../../lib/limits'

type DbCtx = QueryCtx | MutationCtx

export const hasFeaturedSlot = (
  ranking: Pick<Doc<'publishedRankings'>, 'featuredRank' | 'featuredBadge'>
): boolean => ranking.featuredRank !== null && ranking.featuredBadge !== null

export const takeBoundedSeedRankings = async (
  ctx: DbCtx,
  options: {
    datasetKey: string
    releaseId: string
    status?: SeedRankingReleaseStatus
    limit?: number
    overLimitMessage: string
  }
): Promise<Doc<'publishedRankings'>[]> =>
{
  const limit = options.limit ?? SEED_LIMITS.rankingSeedRowsPerRelease
  const status = options.status
  const rows =
    status === undefined
      ? await ctx.db
          .query('publishedRankings')
          .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
            q
              .eq('seedDatasetKey', options.datasetKey)
              .eq('seedReleaseId', options.releaseId)
          )
          .take(limit + 1)
      : await ctx.db
          .query('publishedRankings')
          .withIndex('bySeedDatasetReleaseStatus', (q) =>
            q
              .eq('seedDatasetKey', options.datasetKey)
              .eq('seedReleaseId', options.releaseId)
              .eq('seedReleaseStatus', status)
          )
          .take(limit + 1)

  if (rows.length <= limit) return rows
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: options.overLimitMessage,
  })
}

type SeedExternalIdTable = 'publishedRankings' | 'boards' | 'templates'
type SeedExternalIdArgs = {
  datasetKey: string
  releaseId: string
  seedExternalId: string
}

export function findSeedRowByExternalId(
  ctx: DbCtx,
  tableName: 'publishedRankings',
  args: SeedExternalIdArgs
): Promise<Doc<'publishedRankings'> | null>
export function findSeedRowByExternalId(
  ctx: DbCtx,
  tableName: 'boards',
  args: SeedExternalIdArgs
): Promise<Doc<'boards'> | null>
export function findSeedRowByExternalId(
  ctx: DbCtx,
  tableName: 'templates',
  args: SeedExternalIdArgs
): Promise<Doc<'templates'> | null>
export async function findSeedRowByExternalId(
  ctx: DbCtx,
  tableName: SeedExternalIdTable,
  args: SeedExternalIdArgs
): Promise<Doc<'publishedRankings'> | Doc<'boards'> | Doc<'templates'> | null>
{
  return await ctx.db
    .query(tableName)
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q
        .eq('seedDatasetKey', args.datasetKey)
        .eq('seedReleaseId', args.releaseId)
        .eq('seedExternalId', args.seedExternalId)
    )
    .unique()
}
