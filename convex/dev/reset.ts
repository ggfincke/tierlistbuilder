// convex/dev/reset.ts
// dev-only deployment wipe; truncates user tables + _storage after env-gated confirm

import { ConvexError, v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { internal } from '../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

// every user table in the schema, ordered children-first so partial failures
// leave fewer dangling foreign-id refs (convex doesn't enforce FKs, but a clean
// order makes a half-completed reset less confusing to inspect)
const RESETTABLE_TABLES = [
  'shortLinks',
  'userTemplateBookmarks',
  'templateRankingAggregateJobs',
  'templateRankingAggregateItems',
  'templateRankingAggregates',
  'publishedRankingItems',
  'publishedRankingTiers',
  'publishedRankings',
  'templateItems',
  'templateCloneJobs',
  'templatePublishJobs',
  'templateTags',
  'seedRunStorageUploads',
  'seedRuns',
  'marketplaceStats',
  'templateMetricDays',
  'templateStats',
  'templateCards',
  'templates',
  'tierPresets',
  'mediaVariants',
  'mediaAssets',
  'boardItems',
  'boardTiers',
  'boards',
  'userPreferences',
  'users',
  // @convex-dev/auth tables last; cascading user deletes shouldn't race w/
  // in-flight session lookups on the way down
  'authRateLimits',
  'authVerifiers',
  'authVerificationCodes',
  'authRefreshTokens',
  'authAccounts',
  'authSessions',
] as const

type ResettableTable = (typeof RESETTABLE_TABLES)[number]

const resettableTableValidator = v.union(
  ...(RESETTABLE_TABLES.map((name) => v.literal(name)) as [
    ReturnType<typeof v.literal<ResettableTable>>,
    ...ReturnType<typeof v.literal<ResettableTable>>[],
  ])
)

// stay well under the 8192-doc per-mutation cap so each batch leaves headroom
// for index writes triggered by ctx.db.delete
const RESET_BATCH_SIZE = 256

const DEV_RESET_ENABLED_ENV = 'CONVEX_DEV_RESET_ALLOWED'

const resolveDeploymentMarker = (): string =>
{
  const url = process.env.CONVEX_SITE_URL ?? process.env.CONVEX_CLOUD_URL
  if (!url)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message:
        'dev reset cannot resolve CONVEX_SITE_URL / CONVEX_CLOUD_URL; refusing to run',
    })
  }
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

const requireDevResetAuthorized = (confirm: string): string =>
{
  if (process.env[DEV_RESET_ENABLED_ENV] !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `dev reset is disabled — set ${DEV_RESET_ENABLED_ENV}=true on this deployment to allow it`,
    })
  }
  const marker = resolveDeploymentMarker()
  const expected = `RESET-${marker}`
  if (confirm !== expected)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `dev reset confirm token mismatch — expected "${expected}"`,
    })
  }
  return marker
}

export const wipeDeployment = internalAction({
  args: {
    confirm: v.string(),
  },
  returns: v.object({
    deploymentMarker: v.string(),
    deletedCounts: v.record(v.string(), v.number()),
    deletedStorageBlobs: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    deploymentMarker: string
    deletedCounts: Record<string, number>
    deletedStorageBlobs: number
  }> =>
  {
    const deploymentMarker = requireDevResetAuthorized(args.confirm)

    let deletedStorageBlobs = 0
    while (true)
    {
      const storageIds: Id<'_storage'>[] = await ctx.runQuery(
        internal.dev.reset.listStorageBlobBatch,
        { limit: RESET_BATCH_SIZE }
      )
      if (storageIds.length === 0) break
      await Promise.all(
        storageIds.map(async (storageId) => ctx.storage.delete(storageId))
      )
      deletedStorageBlobs += storageIds.length
    }

    const deletedCounts: Record<string, number> = {}
    for (const tableName of RESETTABLE_TABLES)
    {
      let total = 0
      while (true)
      {
        const deleted: number = await ctx.runMutation(
          internal.dev.reset.wipeTableBatch,
          { tableName, limit: RESET_BATCH_SIZE }
        )
        total += deleted
        if (deleted < RESET_BATCH_SIZE) break
      }
      deletedCounts[tableName] = total
    }

    return { deploymentMarker, deletedCounts, deletedStorageBlobs }
  },
})

export const listStorageBlobBatch = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.id('_storage')),
  handler: async (ctx, args): Promise<Id<'_storage'>[]> =>
  {
    const rows = await ctx.db.system.query('_storage').take(args.limit)
    return rows.map((row) => row._id)
  },
})

export const wipeTableBatch = internalMutation({
  args: {
    tableName: resettableTableValidator,
    limit: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> =>
  {
    // tableName is constrained at the validator boundary to RESETTABLE_TABLES,
    // so the runtime cast is safe — convex's typed db.query needs a string
    // literal & we'd otherwise need a giant switch over 32 tables
    const rows = await ctx.db
      .query(args.tableName as ResettableTable)
      .take(args.limit)
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)))
    return rows.length
  },
})
