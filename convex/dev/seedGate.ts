// convex/dev/seedGate.ts
// shared opt-in guard for dev-only sample seed tools

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export const DEV_SAMPLE_SEED_ENABLED_ENV = 'CONVEX_TLOTL_SAMPLE_SEED_ALLOWED'

export const requireDevSampleSeedAuthorized = (label: string): void =>
{
  if (process.env[DEV_SAMPLE_SEED_ENABLED_ENV] !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `${label} is disabled - set ${DEV_SAMPLE_SEED_ENABLED_ENV}=true on this deployment to allow it`,
    })
  }
}
