// convex/marketplace/seedAuth.ts
// shared secret gate for marketplace seed APIs

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

const SEED_SECRET_ENV = 'CONVEX_SEED_SECRET'

export const requireSeedAuthorized = (seedSecret: string): void =>
{
  if (process.env.CONVEX_SEED_ENABLED !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message:
        'seeding is disabled - set CONVEX_SEED_ENABLED=true on this deployment to allow it',
    })
  }

  const expectedSecret = process.env.CONVEX_SEED_SECRET
  if (!expectedSecret || seedSecret !== expectedSecret)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is locked - pass the deployment ${SEED_SECRET_ENV} value`,
    })
  }
}
