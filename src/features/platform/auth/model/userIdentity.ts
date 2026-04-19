// src/features/platform/auth/model/userIdentity.ts
// stable user identifier derivation — single source for the externalId fallback policy

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'

// derive a stable string identifier for a user doc. prefers the explicit
// externalId (set by the auth provider) w/ a fallback to the Convex _id
export const getUserStableId = (user: PublicUserMe): string =>
  user.externalId ?? user._id
