// convex/marketplace/seed/auth.ts
// shared secret gate for marketplace seed APIs

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export const SEED_ENABLED_ENV = 'CONVEX_SEED_ENABLED'
export const SEED_SECRET_ENV = 'CONVEX_SEED_SECRET'
export const SEED_AUTH_HEADER = 'authorization'

const secretMatches = (actual: string, expected: string): boolean =>
{
  const encoder = new TextEncoder()
  const actualBytes = encoder.encode(actual)
  const expectedBytes = encoder.encode(expected)
  const length = Math.max(actualBytes.length, expectedBytes.length)
  let diff = actualBytes.length ^ expectedBytes.length
  for (let index = 0; index < length; index += 1)
  {
    diff |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0)
  }
  return diff === 0
}

export const requireSeedAuthorized = (seedSecret: string): void =>
{
  if (process.env[SEED_ENABLED_ENV] !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is disabled - set ${SEED_ENABLED_ENV}=true on this deployment to allow it`,
    })
  }

  const expectedSecret = process.env[SEED_SECRET_ENV]
  if (!expectedSecret || !secretMatches(seedSecret, expectedSecret))
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is locked - pass the deployment ${SEED_SECRET_ENV} value`,
    })
  }
}

export const requireSeedRequestAuthorized = (request: Request): void =>
{
  const authorization = request.headers.get(SEED_AUTH_HEADER) ?? ''
  const [scheme, token] = authorization.trim().split(/\s+/, 2)
  const isBearer = scheme?.toLowerCase() === 'bearer' && Boolean(token)
  requireSeedAuthorized(isBearer ? token : '')
}
