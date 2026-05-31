// convex/marketplace/seedPipeline/storageUploads.ts
// internal Convex API for the seedRunStorageUploads registry — tracks per-run
// _storage blobs so cleanup can drop abandoned ones

import { ConvexError, v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { assertCountRange } from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import { cleanupStorageIds } from './media'
import { assertSeedRunArgs, loadSeedRunOrThrow } from './runs'
import type { SeedCleanupResult, SeedRegisterUploadsResult } from './types'

type StorageUploadDoc = Doc<'seedRunStorageUploads'>

type RunScope = {
  datasetKey: string
  releaseId: string
  runId: string
}

const seedCleanupEligibleValidator = v.object({
  eligible: v.array(
    v.object({
      rowId: v.id('seedRunStorageUploads'),
      storageId: v.id('_storage'),
    })
  ),
  skippedStorageIds: v.array(v.string()),
})

const seedRegisterUploadsOutputValidator = v.object({
  registeredStorageIds: v.array(v.string()),
})

const seedCleanupOutputValidator = v.object({
  cleanedStorageIds: v.array(v.string()),
  missingStorageIds: v.array(v.string()),
  skippedStorageIds: v.array(v.string()),
})

const loadStorageUploadsByStorageIds = async (
  ctx: QueryCtx | MutationCtx,
  storageIds: readonly Id<'_storage'>[]
): Promise<(StorageUploadDoc | null)[]> =>
  await Promise.all(
    storageIds.map((storageId) =>
      ctx.db
        .query('seedRunStorageUploads')
        .withIndex('byStorageId', (q) => q.eq('storageId', storageId))
        .unique()
    )
  )

const isOwnedByRun = (
  row: StorageUploadDoc | null,
  scope: RunScope,
  requiredStatus?: StorageUploadDoc['status']
): row is StorageUploadDoc =>
{
  if (!row) return false
  if (row.datasetKey !== scope.datasetKey) return false
  if (row.releaseId !== scope.releaseId) return false
  if (row.runId !== scope.runId) return false
  if (requiredStatus && row.status !== requiredStatus) return false
  return true
}

export const registerSeedUploadedStorageIds = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  returns: seedRegisterUploadsOutputValidator,
  handler: async (ctx, args): Promise<SeedRegisterUploadsResult> =>
  {
    assertSeedRunArgs(args)
    assertCountRange(
      'storageIds',
      args.storageIds.length,
      1,
      SEED_LIMITS.storageIdsPerCleanup
    )
    await loadSeedRunOrThrow(ctx, args.datasetKey, args.releaseId, args.runId)
    const existing = await loadStorageUploadsByStorageIds(ctx, args.storageIds)
    for (const row of existing)
    {
      if (row && !isOwnedByRun(row, args))
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: 'seed upload storageId already belongs to another run',
        })
      }
    }
    const now = Date.now()
    await Promise.all(
      args.storageIds.map(async (storageId, index) =>
      {
        if (existing[index]) return
        await ctx.db.insert('seedRunStorageUploads', {
          datasetKey: args.datasetKey,
          releaseId: args.releaseId,
          runId: args.runId,
          storageId,
          status: 'uploaded',
          createdAt: now,
          updatedAt: now,
        })
      })
    )
    return {
      registeredStorageIds: args.storageIds.map((id) => id as string),
    }
  },
})

export const markSeedUploadedStorageIdsResolved = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const rows = await loadStorageUploadsByStorageIds(ctx, args.storageIds)
    const now = Date.now()
    await Promise.all(
      rows.map(async (row) =>
      {
        if (!isOwnedByRun(row, args, 'uploaded')) return
        await ctx.db.patch(row._id, { status: 'resolved', updatedAt: now })
      })
    )
    return null
  },
})

export const resolveSeedCleanupStorageIds = internalQuery({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  returns: seedCleanupEligibleValidator,
  handler: async (
    ctx,
    args
  ): Promise<{
    eligible: {
      rowId: Id<'seedRunStorageUploads'>
      storageId: Id<'_storage'>
    }[]
    skippedStorageIds: string[]
  }> =>
  {
    const run = await loadSeedRunOrThrow(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.runId
    )
    if (run.status === 'active' || run.status === 'verified')
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'seed cleanup is only allowed for incomplete or inactive runs',
      })
    }
    const rows = await loadStorageUploadsByStorageIds(ctx, args.storageIds)
    const eligible: {
      rowId: Id<'seedRunStorageUploads'>
      storageId: Id<'_storage'>
    }[] = []
    const skippedStorageIds: string[] = []
    for (let index = 0; index < rows.length; index += 1)
    {
      const row = rows[index]
      const storageId = args.storageIds[index]
      if (isOwnedByRun(row, args, 'uploaded'))
      {
        eligible.push({ rowId: row._id, storageId })
      }
      else
      {
        skippedStorageIds.push(storageId as string)
      }
    }
    return { eligible, skippedStorageIds }
  },
})

export const markSeedUploadedStorageIdsCleaned = internalMutation({
  args: {
    rowIds: v.array(v.id('seedRunStorageUploads')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const now = Date.now()
    await Promise.all(
      args.rowIds.map(async (rowId) =>
      {
        const row = await ctx.db.get(rowId)
        if (!row)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message: `seed cleanup storage row missing after blob cleanup: ${rowId}`,
          })
        }
        if (row.status === 'cleaned') return
        if (row.status === 'resolved')
        {
          console.warn(
            `seed cleanup raced finalized storage row=${rowId}; marking cleaned because the blob was consumed`
          )
        }
        await ctx.db.patch(rowId, { status: 'cleaned', updatedAt: now })
      })
    )
    return null
  },
})

export const cleanupAbandonedSeedRun = internalAction({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  returns: seedCleanupOutputValidator,
  handler: async (ctx, args): Promise<SeedCleanupResult> =>
  {
    assertSeedRunArgs(args)
    assertCountRange(
      'storageIds',
      args.storageIds.length,
      0,
      SEED_LIMITS.storageIdsPerCleanup
    )
    const { eligible, skippedStorageIds } = await ctx.runQuery(
      internal.marketplace.seedPipeline.storageUploads
        .resolveSeedCleanupStorageIds,
      args
    )
    const eligibleStorageIds = eligible.map((row) => row.storageId)
    const { cleanedStorageIds, missingStorageIds } = await cleanupStorageIds(
      ctx,
      eligibleStorageIds
    )
    const consumed = new Set<string>([
      ...cleanedStorageIds,
      ...missingStorageIds,
    ])
    const rowIdsToMark = eligible
      .filter((row) => consumed.has(row.storageId as string))
      .map((row) => row.rowId)
    if (rowIdsToMark.length > 0)
    {
      await ctx.runMutation(
        internal.marketplace.seedPipeline.storageUploads
          .markSeedUploadedStorageIdsCleaned,
        { rowIds: rowIdsToMark }
      )
    }
    return {
      cleanedStorageIds,
      missingStorageIds,
      skippedStorageIds,
    }
  },
})
