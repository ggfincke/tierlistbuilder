// src/features/platform/auth/model/userIdentity.ts
// stable user identifier derivation — single source for the externalId fallback policy

import type { Doc } from '@convex/_generated/dataModel'

// derive a stable string identifier for a user doc. prefers the explicit
// externalId (set by the auth provider) w/ a fallback to the Convex _id
export const getUserStableId = (user: Doc<'users'>): string =>
  user.externalId ?? user._id
