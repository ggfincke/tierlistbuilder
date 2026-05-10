// convex/marketplace/seedAuth.ts
// shared secret gate for marketplace seed APIs

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export const SEED_ENABLED_ENV = 'CONVEX_SEED_ENABLED'
export const SEED_SECRET_ENV = 'CONVEX_SEED_SECRET'

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
  if (!expectedSecret || seedSecret !== expectedSecret)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is locked - pass the deployment ${SEED_SECRET_ENV} value`,
    })
  }
}
