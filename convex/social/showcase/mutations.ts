// convex/social/showcase/mutations.ts
// owner-only profile-showcase persistence

import { v } from 'convex/values'
import { mutation } from '../../_generated/server'
import { requireCurrentUserId } from '../../lib/auth'
import { saveProfileShowcaseForUser } from './lib'
import { profileShowcaseSaveInputValidator } from './validators'

export const saveProfileShowcase = mutation({
  args: profileShowcaseSaveInputValidator.fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await saveProfileShowcaseForUser(ctx, userId, args)
    return null
  },
})
