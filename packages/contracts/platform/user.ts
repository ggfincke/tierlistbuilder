// packages/contracts/platform/user.ts
// public user shape projected by users.getMe — narrower than Doc<'users'>,
// excludes operator diagnostics, auth internals, & raw avatarStorageId

export type UserTier = 'free' | 'premium'

export interface PublicUserMe
{
  _id: string
  email: string | null
  name: string | null
  displayName: string | null
  image: string | null
  externalId: string | null
  tier: UserTier
  createdAt: number
  updatedAt: number | null
  // public-profile fields — null until the user fills them in. surfaced on
  // the future /u/:handle route; AccountModal lets users edit them today
  handle: string | null
  bio: string | null
  location: string | null
  website: string | null
  pronouns: string | null
}
