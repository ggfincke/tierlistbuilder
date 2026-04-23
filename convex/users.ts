// convex/users.ts
// * user queries — callable from the frontend to read the authenticated user

import { v } from 'convex/values'
import { query } from './_generated/server'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { getCurrentUser } from './lib/auth'

// validator for getMe — public projection excluding operator diagnostics &
// auth internals. _id is a plain string (contracts can't depend on Convex's
// branded Id<'users'>); brand is lost but only used as opaque identifier
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

// return the caller's public profile, or null if unauthenticated.
// narrower than Doc<'users'> to keep internal bookkeeping off the wire
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
      tier: user.tier ?? 'free',
      createdAt: user.createdAt ?? user._creationTime,
      updatedAt: user.updatedAt ?? null,
    }
  },
})
