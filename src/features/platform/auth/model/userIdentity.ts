// src/features/platform/auth/model/userIdentity.ts
// stable user identifier derivation — single source for the externalId fallback policy

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'

// derive the user-owner key used by local sync sidecars & upload indexes.
// match Convex's users row id so client scopes line up w/ server auth checks
export const getUserStableId = (user: PublicUserMe): string => user._id
