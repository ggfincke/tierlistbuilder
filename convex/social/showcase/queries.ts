// convex/social/showcase/queries.ts
// owner-only profile-showcase editor reads

import { query } from '../../_generated/server'
import {
  DEFAULT_SHOWCASE_TIERS,
  type ProfileShowcaseEditData,
} from '@tierlistbuilder/contracts/social/showcase'
import { getCurrentUserId } from '../../lib/auth'
import { buildEditData } from './lib'
import { profileShowcaseEditDataValidator } from './validators'

export const getMyProfileShowcase = query({
  args: {},
  returns: profileShowcaseEditDataValidator,
  handler: async (ctx): Promise<ProfileShowcaseEditData> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return {
        tiers: DEFAULT_SHOWCASE_TIERS,
        placed: [],
        unranked: [],
      }
    }
    return await buildEditData(ctx, userId)
  },
})
