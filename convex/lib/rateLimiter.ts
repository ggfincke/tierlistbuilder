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
// short-link creation is signed-in only, so every bucket is user-scoped
const rateLimiter = new RateLimiter(components.rateLimiter, {
  userShortLink: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 10 },
  userShortLinkCreate: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  // high cap pairs w/ serial client uploads; boards can carry many images
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
})

// enforce a bucket & throw a structured ConvexError on exhaustion w/ retryAfter
export const enforceRateLimit = async (
  ctx: MutationCtx,
  name:
    | 'userShortLink'
    | 'userShortLinkCreate'
    | 'userMediaUpload'
    | 'userTemplatePublish',
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
