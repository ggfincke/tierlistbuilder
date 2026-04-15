// convex/users/index.ts
// * user queries — callable from the frontend to read the authenticated user

import { query } from '../_generated/server'
import { getCurrentUser } from '../lib/auth'

// return the authenticated caller's users row, or null if unauthenticated
// used by the frontend to render account-aware UI w/o hitting a 401
export const getMe = query({
  args: {},
  handler: async (ctx) =>
  {
    return await getCurrentUser(ctx)
  },
})
