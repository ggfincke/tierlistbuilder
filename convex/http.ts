// convex/http.ts
// * convex HTTP router - registers auth callback & seed-ingest routes

import { httpRouter } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { auth } from './auth'
import { httpAction, type ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import { requireSeedRequestAuthorized } from './marketplace/seedAuth'
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

const readSeedJsonBody = async (
  request: Request
): Promise<Record<string, unknown>> =>
{
  const body = await request.json()
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

const seedRuns = internal.marketplace.seedRuns
const storageUploads = internal.marketplace.seedPipeline.storageUploads
const rankingSeeds = internal.marketplace.rankings.seed
const rankingSeedLifecycle = internal.marketplace.rankings.seedLifecycle

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
  ['/api/seed/rankings/apply', 'action', rankingSeeds.applySeedRankings],
  ['/api/seed/rankings/verify', 'query', rankingSeeds.verifySeedRankings],
  [
    '/api/seed/rankings/activate',
    'mutation',
    rankingSeedLifecycle.activateSeedRankings,
  ],
  [
    '/api/seed/rankings/rollback',
    'mutation',
    rankingSeedLifecycle.rollbackSeedRankings,
  ],
  ['/api/seed/status', 'query', seedRuns.getSeedRunStatus],
  ['/api/dev/reset', 'action', internal.dev.reset.wipeDeployment],
] as const

for (const [path, kind, ref] of SEED_ROUTES)
{
  http.route({ path, method: 'POST', handler: seedHttpAction(kind, ref) })
}

export default http
