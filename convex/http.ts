// convex/http.ts
// * convex HTTP router - registers auth callback & seed-ingest routes

import { httpRouter } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { auth } from './auth'
import { httpAction, type ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import { requireSeedRequestAuthorized } from './marketplace/seedAuth'

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

const toSeedErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'seed request failed'

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
      return seedJsonResponse(400, {
        status: 'error',
        errorMessage: toSeedErrorMessage(error),
      })
    }
  })

const seedRuns = internal.marketplace.seedRuns
const storageUploads = internal.marketplace.seedPipeline.storageUploads

const SEED_ROUTES: readonly [string, SeedRouteKind, SeedRouteRef][] = [
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
  ['/api/seed/upsert-items', 'mutation', seedRuns.upsertSeedItems],
  ['/api/seed/upsert-criteria', 'mutation', seedRuns.upsertSeedCriteria],
  ['/api/seed/verify', 'mutation', seedRuns.verifySeedRelease],
  ['/api/seed/activate', 'mutation', seedRuns.activateSeedRelease],
  ['/api/seed/rollback', 'mutation', seedRuns.rollbackSeedRelease],
  ['/api/seed/status', 'query', seedRuns.getSeedRunStatus],
  ['/api/dev/reset', 'action', internal.dev.reset.wipeDeployment],
] as const

for (const [path, kind, ref] of SEED_ROUTES)
{
  http.route({ path, method: 'POST', handler: seedHttpAction(kind, ref) })
}

export default http
