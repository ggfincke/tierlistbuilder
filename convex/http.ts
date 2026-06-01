// convex/http.ts
// * convex HTTP router - registers auth callback & seed-ingest routes

import { ConvexError } from 'convex/values'
import { httpRouter } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { auth } from './auth'
import { httpAction, type ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import { requireSeedRequestAuthorized } from './marketplace/seed/auth'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

const http = httpRouter()

// register /auth/* routes required by @convex-dev/auth for OAuth callbacks
auth.addHttpRoutes(http)

const seedJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// per-request cap on seed payload bytes. 4 MiB headroom for SEED_LIMITS.itemUpsertsPerCall
// (4096 items × ~200B JSON-encoded -> ~1MB realistic peak) while keeping a single
// malformed body from gobbling the action's memory budget
const SEED_REQUEST_BODY_BYTE_CAP = 4 * 1024 * 1024

const readSeedJsonBody = async (
  request: Request
): Promise<Record<string, unknown>> =>
{
  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > SEED_REQUEST_BODY_BYTE_CAP)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.payloadTooLarge,
      message: `seed request body exceeds ${SEED_REQUEST_BODY_BYTE_CAP} bytes`,
    })
  }
  const text = new TextDecoder().decode(buffer)
  const body = text.length === 0 ? null : JSON.parse(text)
  if (!body || typeof body !== 'object' || Array.isArray(body))
  {
    throw new Error('seed request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

type SeedErrorDetails = {
  code: ConvexErrorCode | null
  message: string
}

const SEED_ERROR_HTTP_STATUS: Partial<Record<ConvexErrorCode, number>> = {
  [CONVEX_ERROR_CODES.forbidden]: 403,
  [CONVEX_ERROR_CODES.unauthenticated]: 401,
  [CONVEX_ERROR_CODES.notFound]: 404,
  [CONVEX_ERROR_CODES.invalidState]: 409,
  [CONVEX_ERROR_CODES.payloadTooLarge]: 413,
  [CONVEX_ERROR_CODES.rateLimited]: 429,
  [CONVEX_ERROR_CODES.invalidInput]: 400,
}

const isConvexErrorCode = (value: unknown): value is ConvexErrorCode =>
  Object.values(CONVEX_ERROR_CODES).includes(value as ConvexErrorCode)

const toSeedErrorDetails = (error: unknown): SeedErrorDetails =>
{
  const fallback =
    error instanceof Error ? error.message : 'seed request failed'
  if (!error || typeof error !== 'object' || !('data' in error))
    return { code: null, message: fallback }
  const data = (error as { data?: unknown }).data
  if (!data || typeof data !== 'object')
    return { code: null, message: fallback }
  const rawCode = (data as { code?: unknown }).code
  const rawMessage = (data as { message?: unknown }).message
  return {
    code: isConvexErrorCode(rawCode) ? rawCode : null,
    message: typeof rawMessage === 'string' ? rawMessage : fallback,
  }
}

const seedErrorStatus = (code: ConvexErrorCode | null): number =>
  code ? (SEED_ERROR_HTTP_STATUS[code] ?? 400) : 400

type SeedRouteKind = 'query' | 'mutation' | 'action'
type SeedRouteRef =
  | FunctionReference<'query', 'internal'>
  | FunctionReference<'mutation', 'internal'>
  | FunctionReference<'action', 'internal'>

const dispatchSeedCall = async (
  ctx: ActionCtx,
  kind: SeedRouteKind,
  ref: SeedRouteRef,
  args: Record<string, unknown>
): Promise<unknown> =>
{
  if (kind === 'query')
    return await ctx.runQuery(
      ref as FunctionReference<'query', 'internal'>,
      args
    )
  if (kind === 'mutation')
    return await ctx.runMutation(
      ref as FunctionReference<'mutation', 'internal'>,
      args
    )
  return await ctx.runAction(
    ref as FunctionReference<'action', 'internal'>,
    args
  )
}

const seedHttpAction = (kind: SeedRouteKind, ref: SeedRouteRef) =>
  httpAction(async (ctx, request) =>
  {
    try
    {
      requireSeedRequestAuthorized(request)
      const args = await readSeedJsonBody(request)
      const value = await dispatchSeedCall(ctx, kind, ref, args)
      return seedJsonResponse(200, { status: 'success', value })
    }
    catch (error)
    {
      const details = toSeedErrorDetails(error)
      return seedJsonResponse(seedErrorStatus(details.code), {
        status: 'error',
        errorCode: details.code,
        errorMessage: details.message,
      })
    }
  })

const seedRuns = internal.marketplace.seed.templates.endpoints
const storageUploads = internal.marketplace.seed.lib.storageUploads
const rankingSeeds = internal.marketplace.seed.rankings.actions
const rankingSeedLifecycle = internal.marketplace.seed.rankings.lifecycle
const templateSeeds = internal.marketplace.seed.templates.maintenance

const SEED_ROUTES: readonly [string, SeedRouteKind, SeedRouteRef][] = [
  ['/api/seed/ensure-author', 'action', seedRuns.ensureSeedAuthor],
  ['/api/seed/begin', 'mutation', seedRuns.beginSeedRun],
  ['/api/seed/state', 'query', seedRuns.resolveSeedState],
  ['/api/seed/media-by-hashes', 'query', seedRuns.resolveSeedMediaByHashes],
  ['/api/seed/upload-urls', 'mutation', seedRuns.generateSeedUploadUrls],
  [
    '/api/seed/register-uploads',
    'mutation',
    storageUploads.registerSeedUploadedStorageIds,
  ],
  ['/api/seed/finalize-media', 'action', seedRuns.finalizeSeedUploadedMedia],
  ['/api/seed/cleanup', 'action', storageUploads.cleanupAbandonedSeedRun],
  ['/api/seed/upsert-templates', 'mutation', seedRuns.upsertSeedTemplates],
  ['/api/seed/sync-template-items', 'mutation', seedRuns.syncSeedTemplateItems],
  [
    '/api/seed/sync-template-style-items',
    'mutation',
    seedRuns.syncSeedTemplateStyleItems,
  ],
  ['/api/seed/upsert-criteria', 'mutation', seedRuns.upsertSeedCriteria],
  ['/api/seed/verify-chunk', 'mutation', seedRuns.verifySeedReleaseChunk],
  [
    '/api/seed/complete-verification',
    'mutation',
    seedRuns.completeSeedReleaseVerification,
  ],
  ['/api/seed/activate', 'mutation', seedRuns.activateSeedRelease],
  ['/api/seed/rollback', 'mutation', seedRuns.rollbackSeedRelease],
  ['/api/seed/rankings/preflight', 'query', rankingSeeds.preflightSeedRankings],
  [
    '/api/seed/rankings/ensure-authors',
    'action',
    rankingSeeds.ensureSeedRankingAuthors,
  ],
  ['/api/seed/rankings/apply', 'action', rankingSeeds.applySeedRankingChunk],
  [
    '/api/seed/rankings/cleanup-stale',
    'action',
    rankingSeeds.cleanupStaleSeedRankings,
  ],
  ['/api/seed/rankings/verify', 'query', rankingSeeds.verifySeedRankings],
  [
    '/api/seed/rankings/activate',
    'mutation',
    rankingSeedLifecycle.activateSeedRankings,
  ],
  [
    '/api/seed/rankings/queue-aggregates',
    'mutation',
    rankingSeedLifecycle.queueActiveSeedRankingAggregates,
  ],
  [
    '/api/seed/rankings/rollback',
    'mutation',
    rankingSeedLifecycle.rollbackSeedRankings,
  ],
  [
    '/api/seed/featured-trio',
    'mutation',
    templateSeeds.setFeaturedTrioByExternalIdsImpl,
  ],
  [
    '/api/seed/template-featured-rank',
    'mutation',
    templateSeeds.setTemplateFeaturedRank,
  ],
  [
    '/api/seed/template-criteria',
    'mutation',
    templateSeeds.setTemplateCriteriaImpl,
  ],
  [
    '/api/seed/clear-featured-ranks',
    'mutation',
    templateSeeds.clearAllFeaturedRanksImpl,
  ],
  ['/api/seed/user-status', 'query', templateSeeds.getSeedUserStatusImpl],
  [
    '/api/seed/user-profile',
    'mutation',
    templateSeeds.patchSeedUserProfileImpl,
  ],
  [
    '/api/seed/recompute-stats',
    'mutation',
    templateSeeds.recomputeMarketplaceStatsImpl,
  ],
  ['/api/seed/recompute-tags', 'action', templateSeeds.recomputeTemplateTags],
  ['/api/seed/recompute-cards', 'action', templateSeeds.recomputeTemplateCards],
  ['/api/seed/wipe-seeded-data', 'action', templateSeeds.wipeSeededDataBatch],
  [
    '/api/seed/unpublish-template',
    'mutation',
    templateSeeds.unpublishSeededTemplateImpl,
  ],
  [
    '/api/seed/backfill-ranking-count',
    'action',
    templateSeeds.startTemplateCardRankingCountBackfill,
  ],
  ['/api/seed/status', 'query', seedRuns.getSeedRunStatus],
] as const

for (const [path, kind, ref] of SEED_ROUTES)
{
  http.route({ path, method: 'POST', handler: seedHttpAction(kind, ref) })
}

// /api/dev/reset is registered only when CONVEX_DEV_RESET_ALLOWED=true, so
// prod (where the env is never set) returns 404 at the edge rather than
// exposing the inner wipeDeployment gate to a leaked seed secret
if (process.env.CONVEX_DEV_RESET_ALLOWED === 'true')
{
  http.route({
    path: '/api/dev/reset',
    method: 'POST',
    handler: seedHttpAction('action', internal.dev.reset.wipeDeployment),
  })
}

export default http
