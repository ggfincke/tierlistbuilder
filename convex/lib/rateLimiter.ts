// convex/lib/rateLimiter.ts
// * shared rate-limit definitions & throw helper — bucket names, thresholds,
// & ConvexError surface in one place so every call site uses the same keys & semantics

import { ConvexError } from 'convex/values'
import { HOUR, RateLimiter } from '@convex-dev/rate-limiter'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

// rate-limit bucket identifiers — narrow union so call sites are typo-safe.
// anonShortLink & userShortLink gate upload-url creation; the matching
// *Create buckets gate slug creation. userMediaUpload covers imports
const rateLimiter = new RateLimiter(components.rateLimiter, {
  anonShortLink: { kind: 'fixed window', rate: 1000, period: HOUR },
  anonShortLinkCreate: { kind: 'fixed window', rate: 1000, period: HOUR },
  userShortLink: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 10 },
  userShortLinkCreate: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  userMediaUpload: {
    kind: 'token bucket',
    rate: 100,
    period: HOUR,
    capacity: 100,
  },
})

// enforce a bucket & throw a structured ConvexError on exhaustion w/ retryAfter.
// anon-keyed calls omit the key arg so anon short-link paths consistently hit
// the global anonShortLink bucket
export const enforceRateLimit = async (
  ctx: MutationCtx,
  name: 'userShortLink' | 'userShortLinkCreate' | 'userMediaUpload',
  userId: Id<'users'>
): Promise<void> =>
{
  const status = await rateLimiter.limit(ctx, name, { key: userId })
  if (!status.ok)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.rateLimited,
      message: `rate limit exceeded for ${name}; retry after ${status.retryAfter}ms`,
      retryAfter: status.retryAfter,
    })
  }
}

export const enforceAnonRateLimit = async (
  ctx: MutationCtx,
  name: 'anonShortLink' | 'anonShortLinkCreate'
): Promise<void> =>
{
  const status = await rateLimiter.limit(ctx, name)
  if (!status.ok)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.rateLimited,
      message: `rate limit exceeded for ${name}; retry after ${status.retryAfter}ms`,
      retryAfter: status.retryAfter,
    })
  }
}
