// packages/contracts/platform/user.ts
// public-facing user shape projected by users.getMe — narrower than the raw
// users row: excludes operator diagnostics (lastUpsertError), auth internals
// (isAnonymous, phone, phoneVerificationTime, emailVerificationTime), & the
// raw avatarStorageId (clients use the resolved `image` URL instead)

export type UserTier = 'free' | 'premium'

export interface PublicUserMe
{
  // Convex Id<'users'> — surfaced for userIdentity fallback when externalId
  // is still being populated by the first-sign-in upsert
  _id: string
  email: string | null
  name: string | null
  displayName: string | null
  image: string | null
  externalId: string | null
  tier: UserTier
  createdAt: number
  updatedAt: number | null
}
