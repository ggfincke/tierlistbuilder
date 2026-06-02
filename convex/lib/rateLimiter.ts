// convex/lib/rateLimiter.ts
// * shared rate-limit definitions & throw helper — bucket names, thresholds,
// & ConvexError surface in one place so every call site uses the same keys & semantics

import { ConvexError } from 'convex/values'
import { HOUR, RateLimiter } from '@convex-dev/rate-limiter'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

// bucket identifiers — narrow union below so call sites are typo-safe.
// view buckets assume per-(user, slug) keying via the `scope` option; the
// tight caps debounce one card without throttling cross-card browsing
const rateLimiter = new RateLimiter(components.rateLimiter, {
  userShortLink: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 10 },
  userShortLinkCreate: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  // sized assuming `count = number of URLs` per call (see generateUploadUrls).
  // bulk imports stay generous w/o letting one call mint an unbounded batch
  userMediaUpload: {
    kind: 'token bucket',
    rate: 1_000,
    period: HOUR,
    capacity: 1_000,
  },
  userTemplatePublish: {
    kind: 'token bucket',
    rate: 20,
    period: HOUR,
    capacity: 20,
  },
  // forking inserts a full board + items & ticks the source's fork/trending
  // counters. more generous than publish (casual browsing) but bounded so one
  // account can't mass-create boards or inflate a template's trending rank
  userTemplateFork: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 30,
  },
  // ranking publish also queues an aggregate recompute downstream, so the
  // cap is set tighter than the surface-cost alone would suggest
  userRankingPublish: {
    kind: 'token bucket',
    rate: 20,
    period: HOUR,
    capacity: 20,
  },
  // remixing a consensus inserts a full board + items & ticks the source
  // template's remix/fork stats — same abuse surface as userTemplateFork
  userRankingRemix: {
    kind: 'token bucket',
    rate: 30,
    period: HOUR,
    capacity: 30,
  },
  // keyed per (user, board): a skin switch re-points up to MAX_SYNC_ITEMS rows
  // in one txn (the heaviest write in the feature). appearance-only, so no
  // trending/fork inflation -- the cap just bounds write-load abuse per board
  userBoardStyleSwitch: {
    kind: 'token bucket',
    rate: 20,
    period: HOUR,
    capacity: 20,
  },
  // keyed per (user, slug): one user cannot inflate a single template's
  // viewCount by mashing refresh, but can browse arbitrarily many templates
  userTemplateView: {
    kind: 'token bucket',
    rate: 6,
    period: HOUR,
    capacity: 6,
  },
  userRankingView: {
    kind: 'token bucket',
    rate: 6,
    period: HOUR,
    capacity: 6,
  },
})

type RateLimitBucketName =
  | 'userShortLink'
  | 'userShortLinkCreate'
  | 'userMediaUpload'
  | 'userTemplatePublish'
  | 'userTemplateFork'
  | 'userRankingPublish'
  | 'userRankingRemix'
  | 'userBoardStyleSwitch'
  | 'userTemplateView'
  | 'userRankingView'

interface EnforceRateLimitOptions
{
  // tokens to consume on this call; defaults to 1. use when one operation
  // legitimately costs N units (e.g. minting N upload URLs in one batch)
  count?: number
  // suffix appended to the per-user key so a bucket can be scoped per
  // (user, target) instead of per-user. use for view counters & similar
  // surfaces where the inflation risk is per-target, not per-user
  scope?: string
}

// enforce a bucket & throw a structured ConvexError on exhaustion w/ retryAfter
export const enforceRateLimit = async (
  ctx: MutationCtx,
  name: RateLimitBucketName,
  userId: Id<'users'>,
  options: EnforceRateLimitOptions = {}
): Promise<void> =>
{
  const key = options.scope ? `${userId}:${options.scope}` : userId
  const status = await rateLimiter.limit(ctx, name, {
    key,
    count: options.count ?? 1,
  })
  if (!status.ok)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.rateLimited,
      message: `rate limit exceeded for ${name}; retry after ${status.retryAfter}ms`,
      retryAfter: status.retryAfter,
    })
  }
}
