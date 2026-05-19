// convex/dev/reset.ts
// dev-only deployment wipe; truncates user tables + _storage after env-gated confirm

import { ConvexError, v } from 'convex/values'
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { internal } from '../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  isConvexWriteThrottleError,
  isRetryableWriteError,
  sleep,
} from '../lib/retry'
import {
  DEV_RESET_ENABLED_ENV,
  acquireDevResetLock,
  releaseDevResetLocks,
} from './resetLock'

// every user table in the schema, ordered children-first so partial failures
// leave fewer dangling foreign-id refs (convex doesn't enforce FKs, but a clean
// order makes a half-completed reset less confusing to inspect)
const RESETTABLE_TABLES = [
  'shortLinks',
  'userTemplateBookmarks',
  'templateRankingAggregateAdmission',
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

const RESET_HOT_TABLE_NAMES = [
  'publishedRankingItems',
  'publishedRankingTiers',
  'publishedRankings',
] as const

type ResetHotTable = (typeof RESET_HOT_TABLE_NAMES)[number]
type HotTableId =
  | Id<'publishedRankingItems'>
  | Id<'publishedRankingTiers'>
  | Id<'publishedRankings'>

const resetHotTableValidator = v.union(
  ...(RESET_HOT_TABLE_NAMES.map((name) => v.literal(name)) as [
    ReturnType<typeof v.literal<ResetHotTable>>,
    ...ReturnType<typeof v.literal<ResetHotTable>>[],
  ])
)

const resetHotTableIdValidator = v.union(
  v.id('publishedRankingItems'),
  v.id('publishedRankingTiers'),
  v.id('publishedRankings')
)

const isResetHotTable = (
  tableName: ResettableTable
): tableName is ResetHotTable =>
  (RESET_HOT_TABLE_NAMES as readonly string[]).includes(tableName)

// stay well under the 8192-doc per-mutation cap so each batch leaves headroom
// for index writes triggered by ctx.db.delete
const RESET_BATCH_SIZE = 256
const RESET_MIN_BATCH_SIZE = 1
const RESET_HOT_TABLE_BATCH_SIZE = 512
const STORAGE_DELETE_BATCH_SIZE = 128
const STORAGE_DELETE_CONCURRENCY = 8
const STORAGE_DELETE_BATCH_DELAY_MS = 25
const STORAGE_DELETE_MAX_RETRIES = 12

// page size for paginated walks across _scheduled_functions. completed rows
// stick around ~7d & dominate the table — a .filter() scan blows the 4096-read
// per-mutation budget before matching enough pending/inProgress rows
const SCHEDULED_PAGE_SIZE = 1024

// upper bound on cancel sweeps — generous because post-seed aggregate-job
// cascades (processTemplateRankingAggregateJob re-enqueueing in batches) take
// many passes to fully drain
const SCHEDULED_CANCEL_MAX_PASSES = 50
const SCHEDULED_IDLE_CONFIRM_PASSES = 3
const SCHEDULED_IDLE_CONFIRM_DELAY_MS = 500

// per-batch retry budget for table wipes. if a wipe batch hits OCC because
// something slipped through cancel/drain, redo cancel+drain & try again
const WIPE_BATCH_MAX_RETRIES = 12
const WIPE_BATCH_RETRY_DELAY_MS = 1000

// after cancelling, scheduled actions that were already running keep executing
// (cancel can't halt in-flight actions per Convex docs). poll the specific
// inProgress ids we observed during cancel — direct id lookups avoid a table scan
const SCHEDULED_DRAIN_POLL_MS = 250
const SCHEDULED_DRAIN_MAX_PASSES = 40
// names sampled into the drain-timeout error so the operator knows what didn't
// drain. bounded so we don't blow the 1MB query result limit on pathological runs
const SCHEDULED_DRAIN_ERROR_SAMPLE_SIZE = 10

const deleteStorageIdsWithRetries = async (
  ctx: ActionCtx,
  storageIds: readonly Id<'_storage'>[]
): Promise<number> =>
{
  let pending = [...storageIds]
  let deleted = 0
  for (
    let attempt = 0;
    pending.length > 0 && attempt <= STORAGE_DELETE_MAX_RETRIES;
    attempt++
  )
  {
    const current = pending
    pending = []
    const results = await Promise.allSettled(
      current.map((storageId) => ctx.storage.delete(storageId))
    )
    for (const [index, result] of results.entries())
    {
      if (result.status === 'fulfilled')
      {
        deleted += 1
        continue
      }
      if (
        isConvexWriteThrottleError(result.reason) &&
        attempt < STORAGE_DELETE_MAX_RETRIES
      )
      {
        pending.push(current[index])
        continue
      }
      throw result.reason
    }
    if (pending.length > 0)
    {
      await sleep(WIPE_BATCH_RETRY_DELAY_MS)
    }
  }
  return deleted
}

interface ScheduledDrainPassResult
{
  canceled: number
  inProgressObserved: number
}

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
    canceledScheduledFunctions: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    deploymentMarker: string
    deletedCounts: Record<string, number>
    deletedStorageBlobs: number
    canceledScheduledFunctions: number
  }> =>
  {
    const deploymentMarker = requireDevResetAuthorized(args.confirm)

    await ctx.runMutation(internal.dev.reset.acquireDevResetLockForDeployment, {
      deploymentMarker,
    })

    let canceledScheduledFunctions = 0

    // one cancel-sweep + drain cycle. paginates _scheduled_functions, cancels
    // pending/inProgress, then waits for the collected inProgress ids to clear.
    // returned count drives the outer convergence loop & the per-wipe OCC retry
    const runCancelAndDrainOnce =
      async (): Promise<ScheduledDrainPassResult> =>
      {
        let cursor: string | null = null
        let passCanceled = 0
        const passInProgressIds = new Set<Id<'_scheduled_functions'>>()
        while (true)
        {
          const result: {
            canceled: number
            inProgressIds: Id<'_scheduled_functions'>[]
            isDone: boolean
            continueCursor: string
          } = await ctx.runMutation(
            internal.dev.reset.cancelScheduledFunctionsPage,
            { cursor, numItems: SCHEDULED_PAGE_SIZE }
          )
          passCanceled += result.canceled
          for (const id of result.inProgressIds)
          {
            passInProgressIds.add(id)
          }
          if (result.isDone) break
          cursor = result.continueCursor
        }
        canceledScheduledFunctions += passCanceled

        const drainIds = new Set(passInProgressIds)
        let drained = false
        for (
          let drainPass = 0;
          drainPass < SCHEDULED_DRAIN_MAX_PASSES;
          drainPass++
        )
        {
          if (drainIds.size === 0)
          {
            drained = true
            break
          }
          const stillRunning: Id<'_scheduled_functions'>[] = await ctx.runQuery(
            internal.dev.reset.filterStillRunningScheduledFunctions,
            { ids: Array.from(drainIds) }
          )
          if (stillRunning.length === 0)
          {
            drained = true
            break
          }
          drainIds.clear()
          for (const id of stillRunning)
          {
            drainIds.add(id)
          }
          await sleep(SCHEDULED_DRAIN_POLL_MS)
        }
        if (!drained)
        {
          const sampleIds = Array.from(drainIds).slice(
            0,
            SCHEDULED_DRAIN_ERROR_SAMPLE_SIZE
          )
          const sampleNames: string[] = await ctx.runQuery(
            internal.dev.reset.getScheduledFunctionNames,
            { ids: sampleIds }
          )
          const timeoutSeconds =
            (SCHEDULED_DRAIN_POLL_MS * SCHEDULED_DRAIN_MAX_PASSES) / 1000
          const sample =
            sampleNames.length > 0
              ? sampleNames.join(', ') +
                (drainIds.size > sampleNames.length ? ', …' : '')
              : '<none sampled>'
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message:
              `dev reset: scheduled actions did not drain within ${timeoutSeconds}s; ` +
              `still in-flight: ${sample}. retry once they finish.`,
          })
        }
        return {
          canceled: passCanceled,
          inProgressObserved: passInProgressIds.size,
        }
      }

    const waitForScheduledQuiescence = async (): Promise<void> =>
    {
      // cancel + drain until multiple passes find neither pending nor
      // in-progress work. an in-progress cascade can enqueue its next page right
      // as it exits, so one idle-looking sweep is not enough.
      let idlePasses = 0
      for (let pass = 0; pass < SCHEDULED_CANCEL_MAX_PASSES; pass++)
      {
        const result = await runCancelAndDrainOnce()
        if (result.canceled === 0 && result.inProgressObserved === 0)
        {
          idlePasses += 1
          if (idlePasses >= SCHEDULED_IDLE_CONFIRM_PASSES) return
          await sleep(SCHEDULED_IDLE_CONFIRM_DELAY_MS)
          continue
        }
        idlePasses = 0
      }
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message:
          `dev reset: scheduled-function churn did not stabilize within ${SCHEDULED_CANCEL_MAX_PASSES} passes. ` +
          `something is enqueueing new work faster than we can cancel it; retry later.`,
      })
    }

    // shared retry shape for both hot & cold wipe paths. shrinks the batch
    // on each retry so an OCC-prone table eventually converges, & re-runs
    // quiescence so we don't keep tripping on the same cascade
    const runWipeBatchWithRetries = async (options: {
      initialBatchSize: number
      invoke: (batchSize: number) => Promise<number>
      isRetryable: (error: unknown) => boolean
    }): Promise<{ deleted: number; batchSize: number }> =>
    {
      let batchSize = options.initialBatchSize
      for (let attempt = 0; attempt <= WIPE_BATCH_MAX_RETRIES; attempt++)
      {
        try
        {
          const deleted = await options.invoke(batchSize)
          return { deleted, batchSize }
        }
        catch (error)
        {
          if (
            !options.isRetryable(error) ||
            attempt >= WIPE_BATCH_MAX_RETRIES
          )
          {
            throw error
          }
          batchSize = Math.max(RESET_MIN_BATCH_SIZE, Math.floor(batchSize / 2))
          await waitForScheduledQuiescence()
          await sleep(WIPE_BATCH_RETRY_DELAY_MS)
        }
      }
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'wipe batch retry loop exited unexpectedly',
      })
    }

    await waitForScheduledQuiescence()

    let deletedStorageBlobs = 0
    while (true)
    {
      const storageIds: Id<'_storage'>[] = await ctx.runQuery(
        internal.dev.reset.listStorageBlobBatch,
        { limit: STORAGE_DELETE_BATCH_SIZE }
      )
      if (storageIds.length === 0) break
      for (
        let index = 0;
        index < storageIds.length;
        index += STORAGE_DELETE_CONCURRENCY
      )
      {
        deletedStorageBlobs += await deleteStorageIdsWithRetries(
          ctx,
          storageIds.slice(index, index + STORAGE_DELETE_CONCURRENCY)
        )
        await sleep(STORAGE_DELETE_BATCH_DELAY_MS)
      }
    }

    const deletedCounts: Record<string, number> = {}
    for (const tableName of RESETTABLE_TABLES)
    {
      let total = 0
      let batchSize = isResetHotTable(tableName)
        ? RESET_HOT_TABLE_BATCH_SIZE
        : RESET_BATCH_SIZE
      if (isResetHotTable(tableName))
      {
        const hotTableName: ResetHotTable = tableName
        while (true)
        {
          const ids: HotTableId[] = await ctx.runQuery(
            internal.dev.reset.listHotTableIdBatch,
            { tableName: hotTableName, limit: batchSize }
          )
          if (ids.length === 0) break
          const outcome = await runWipeBatchWithRetries({
            initialBatchSize: batchSize,
            invoke: (bs) =>
              ctx.runMutation(internal.dev.reset.wipeHotTableIdBatch, {
                tableName: hotTableName,
                ids: ids.slice(0, bs),
              }),
            isRetryable: isRetryableWriteError,
          })
          batchSize = outcome.batchSize
          total += outcome.deleted
          if (ids.length < batchSize) break
        }
        deletedCounts[tableName] = total
        continue
      }
      while (true)
      {
        const outcome = await runWipeBatchWithRetries({
          initialBatchSize: batchSize,
          invoke: (bs) =>
            ctx.runMutation(internal.dev.reset.wipeTableBatch, {
              tableName,
              limit: bs,
            }),
          isRetryable: isRetryableWriteError,
        })
        batchSize = outcome.batchSize
        total += outcome.deleted
        if (outcome.deleted < batchSize) break
      }
      deletedCounts[tableName] = total
    }

    await ctx.runMutation(internal.dev.reset.releaseDevResetLocksForDeployment)

    return {
      deploymentMarker,
      deletedCounts,
      deletedStorageBlobs,
      canceledScheduledFunctions,
    }
  },
})

export const acquireDevResetLockForDeployment = internalMutation({
  args: {
    deploymentMarker: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    await acquireDevResetLock(ctx, args.deploymentMarker)
    return null
  },
})

export const releaseDevResetLocksForDeployment = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => await releaseDevResetLocks(ctx),
})

export const cancelScheduledFunctionsPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  returns: v.object({
    canceled: v.number(),
    inProgressIds: v.array(v.id('_scheduled_functions')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    canceled: number
    inProgressIds: Id<'_scheduled_functions'>[]
    isDone: boolean
    continueCursor: string
  }> =>
  {
    // walk by _creationTime in fixed-size pages so each mutation call reads at
    // most numItems rows. completed rows are ignored in-memory instead of via
    // .filter(), which would scan past the read budget on a dense table
    const page = await ctx.db.system
      .query('_scheduled_functions')
      .paginate({ cursor: args.cursor, numItems: args.numItems })

    const toCancel = page.page.filter(
      (row) => row.state.kind === 'pending' || row.state.kind === 'inProgress'
    )
    const inProgressIds = page.page
      .filter((row) => row.state.kind === 'inProgress')
      .map((row) => row._id)

    // cancel() throws if the fn completed between our query & the cancel
    // call — benign race; treat as already-done
    const results = await Promise.allSettled(
      toCancel.map((row) => ctx.scheduler.cancel(row._id))
    )
    const canceled = results.filter((r) => r.status === 'fulfilled').length

    return {
      canceled,
      inProgressIds,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

// direct id lookup keeps the drain poll off the table scan path — needed
// because a filter+take(1) over _scheduled_functions can blow the 4096-read
// limit when completed rows dominate
export const filterStillRunningScheduledFunctions = internalQuery({
  args: { ids: v.array(v.id('_scheduled_functions')) },
  returns: v.array(v.id('_scheduled_functions')),
  handler: async (ctx, args): Promise<Id<'_scheduled_functions'>[]> =>
  {
    const rows = await Promise.all(args.ids.map((id) => ctx.db.system.get(id)))
    return rows
      .filter(
        (row): row is NonNullable<typeof row> =>
          row !== null && row.state.kind === 'inProgress'
      )
      .map((row) => row._id)
  },
})

// only called on drain-timeout to enrich the error w/ which function paths
// are still running
export const getScheduledFunctionNames = internalQuery({
  args: { ids: v.array(v.id('_scheduled_functions')) },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> =>
  {
    const rows = await Promise.all(args.ids.map((id) => ctx.db.system.get(id)))
    return rows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => row.name)
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

export const listHotTableIdBatch = internalQuery({
  args: {
    tableName: resetHotTableValidator,
    limit: v.number(),
  },
  returns: v.array(resetHotTableIdValidator),
  handler: async (ctx, args): Promise<HotTableId[]> =>
  {
    // validator narrows tableName to RESET_HOT_TABLE_NAMES; the cast satisfies
    // convex's typed db.query without per-table branches — mirrors the trick
    // wipeTableBatch uses for the 32-table cold path below
    const rows = await ctx.db
      .query(args.tableName as ResetHotTable)
      .take(args.limit)
    return rows.map((row) => row._id)
  },
})

export const wipeHotTableIdBatch = internalMutation({
  args: {
    tableName: resetHotTableValidator,
    ids: v.array(resetHotTableIdValidator),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> =>
  {
    // ids are validated as one of the three hot-table id types; the cast
    // satisfies ctx.db's per-table typing — runtime ops dispatch on the id's
    // own encoded table so the phantom type is safe
    const ids = args.ids as Id<'publishedRankingItems'>[]
    let deleted = 0
    for (const id of ids)
    {
      const row = await ctx.db.get(id)
      if (!row) continue
      await ctx.db.delete(id)
      deleted += 1
    }
    return deleted
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
    // wipeDeployment routes hot tables through wipeHotTableIdBatch for finer
    // batching; guard against a future caller bypassing that path
    if (isResetHotTable(args.tableName))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `wipeTableBatch refuses hot table ${args.tableName}; use wipeHotTableIdBatch`,
      })
    }
    // tableName is constrained at the validator boundary to RESETTABLE_TABLES,
    // so the runtime cast is safe — convex's typed db.query needs a string
    // literal & we'd otherwise need a giant switch over 32 tables
    const rows = await ctx.db
      .query(args.tableName as ResettableTable)
      .take(args.limit)
    for (const row of rows)
    {
      await ctx.db.delete(row._id)
    }
    return rows.length
  },
})
