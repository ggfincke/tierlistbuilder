// convex/marketplace/seedPipeline/activation.ts
// shared activation/rollback logic for seed releases. used both by direct
// activate calls & rollback retargeting

import { ConvexError } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { SEED_LIMITS } from '../../lib/limits'
import { resolveActiveReleaseId } from './resolvers'
import { setSeedRunStatus } from './runs'
import {
  loadSeedTemplatesForRelease,
  publishSeedReleaseTemplates,
  rollBackSeedReleaseTemplates,
} from './templates'

export const activateSeedReleaseInternal = async (
  ctx: MutationCtx,
  params: {
    datasetKey: string
    releaseId: string
    run: Doc<'seedRuns'>
    previousReleaseId: string | null
    requireVerified: boolean
  }
): Promise<{ activeReleaseId: string; previousReleaseId: string | null }> =>
{
  if (
    params.requireVerified &&
    params.run.status !== 'verified' &&
    params.run.status !== 'active'
  )
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed release must be verified before activation',
    })
  }
  const currentActive = await resolveActiveReleaseId(ctx, params.datasetKey)
  if (currentActive === params.releaseId)
  {
    const targetTemplates = await loadSeedTemplatesForRelease(
      ctx,
      params.datasetKey,
      params.releaseId
    )
    if (targetTemplates.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed release has no templates: ${params.releaseId}`,
      })
    }
    const now = Date.now()
    await publishSeedReleaseTemplates(ctx, targetTemplates, now)
    await setSeedRunStatus(ctx, params.run, 'active', null, now)
    return {
      activeReleaseId: params.releaseId,
      previousReleaseId: currentActive,
    }
  }
  if (currentActive !== params.previousReleaseId)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'active seed release changed since preflight',
    })
  }
  const targetTemplates = await loadSeedTemplatesForRelease(
    ctx,
    params.datasetKey,
    params.releaseId
  )
  if (targetTemplates.length === 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed release has no templates: ${params.releaseId}`,
    })
  }

  const now = Date.now()
  if (currentActive && currentActive !== params.releaseId)
  {
    const previousTemplates = await loadSeedTemplatesForRelease(
      ctx,
      params.datasetKey,
      currentActive
    )
    await rollBackSeedReleaseTemplates(ctx, previousTemplates, now)
    const activeRuns = await ctx.db
      .query('seedRuns')
      .withIndex('byDatasetStatus', (q) =>
        q.eq('datasetKey', params.datasetKey).eq('status', 'active')
      )
      .take(SEED_LIMITS.templatesPerDiff)
    await Promise.all(
      activeRuns
        .filter((run) => run.releaseId !== params.releaseId)
        .map((run) => setSeedRunStatus(ctx, run, 'rolled_back', null, now))
    )
  }

  await publishSeedReleaseTemplates(ctx, targetTemplates, now)
  await setSeedRunStatus(ctx, params.run, 'active', null, now)
  return {
    activeReleaseId: params.releaseId,
    previousReleaseId: currentActive,
  }
}
