// convex/marketplace/seedPipeline/activation.ts
// shared activation/rollback logic for seed releases. used both by direct
// activate calls & rollback retargeting

import { ConvexError } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { resolveActiveSeedRuns } from './resolvers'
import { setSeedRunStatus } from './runs'
import {
  loadSeedTemplatesForRelease,
  publishSeedReleaseTemplates,
  rollBackSeedReleaseTemplates,
} from './templates'
import { activateSeedRankingReleaseInternal } from '../rankings/seedLifecycle'

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
  const activeRuns = await resolveActiveSeedRuns(ctx, params.datasetKey)
  const activeReleaseIds = Array.from(
    new Set(activeRuns.map((run) => run.releaseId))
  )
  const targetAlreadyActive = activeReleaseIds.includes(params.releaseId)
  const previousStillActive =
    params.previousReleaseId === null
      ? activeReleaseIds.length === 0 || targetAlreadyActive
      : activeReleaseIds.includes(params.previousReleaseId)
  if (!targetAlreadyActive && !previousStillActive)
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
  for (const releaseId of activeReleaseIds)
  {
    if (releaseId === params.releaseId) continue
    const previousTemplates = await loadSeedTemplatesForRelease(
      ctx,
      params.datasetKey,
      releaseId
    )
    await rollBackSeedReleaseTemplates(ctx, previousTemplates, now)
  }
  await Promise.all(
    activeRuns
      .filter((run) => run.releaseId !== params.releaseId)
      .map((run) => setSeedRunStatus(ctx, run, 'rolled_back', null, now))
  )

  await publishSeedReleaseTemplates(ctx, targetTemplates, now)
  await activateSeedRankingReleaseInternal(ctx, {
    datasetKey: params.datasetKey,
    releaseId: params.releaseId,
    previousReleaseIds: activeReleaseIds,
  })
  await setSeedRunStatus(ctx, params.run, 'active', null, now)
  const displacedReleaseId =
    activeReleaseIds.find((releaseId) => releaseId !== params.releaseId) ?? null
  // re-activating the same release is a no-op idempotent retry; surface
  // itself as previous so callers see a stable round-trip rather than null
  const idempotentPrevious = targetAlreadyActive ? params.releaseId : null
  return {
    activeReleaseId: params.releaseId,
    previousReleaseId:
      params.previousReleaseId ?? displacedReleaseId ?? idempotentPrevious,
  }
}
