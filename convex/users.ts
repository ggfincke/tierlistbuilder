// convex/users.ts
// * user queries — callable from the frontend to read the authenticated user

import { v } from 'convex/values'
import { query } from './_generated/server'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { getCurrentUser } from './lib/auth'

// return validator for getMe — narrowed public projection. excludes internal
// fields (lastUpsertError, isAnonymous, phone*, emailVerificationTime,
// avatarStorageId) so operator diagnostics & auth internals don't reach the
// client bundle
// _id projected as plain string — contracts package cannot depend on Convex's
// branded Id<'users'> type, so the wire shape uses a plain string. the brand
// is lost at the frontend but the value is only used as an opaque identifier
const publicUserMeValidator = v.object({
  _id: v.string(),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  externalId: v.union(v.string(), v.null()),
  tier: v.union(v.literal('free'), v.literal('premium')),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
})

// return the authenticated caller's public profile, or null if unauthenticated.
// the projection is intentionally narrower than Doc<'users'> — internal
// bookkeeping (lastUpsertError, etc.) would otherwise leak to the client
export const getMe = query({
  args: {},
  returns: v.union(publicUserMeValidator, v.null()),
  handler: async (ctx): Promise<PublicUserMe | null> =>
  {
    const user = await getCurrentUser(ctx)
    if (!user)
    {
      return null
    }
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      displayName: user.displayName ?? null,
      image: user.image ?? null,
      externalId: user.externalId ?? null,
      tier: user.tier,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt ?? null,
    }
  },
})
