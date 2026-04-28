// packages/contracts/platform/user.ts
// public user shape projected by users.getMe — narrower than Doc<'users'>,
// excludes operator diagnostics, auth internals, & raw avatarStorageId

export type UserTier = 'free' | 'premium'

export const MAX_DISPLAY_NAME_LENGTH = 64
export const MAX_BIO_LENGTH = 200
export const MAX_LOCATION_LENGTH = 80
export const MIN_HANDLE_LENGTH = 3
export const MAX_HANDLE_LENGTH = 24
export const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/

// fixed pronoun set — keeps profile data consistent and avoids open free-text.
// '' means unset (the user hasn't picked). add more here if/when needed
export const PRONOUN_OPTIONS = [
  'he/him',
  'she/her',
  'they/them',
  'he/they',
  'she/they',
  'any pronouns',
  'prefer not to say',
] as const
export type PronounOption = (typeof PRONOUN_OPTIONS)[number]
export const PRONOUN_OPTION_SET: ReadonlySet<string> = new Set(PRONOUN_OPTIONS)

export const RESERVED_HANDLES = [
  'about',
  'account',
  'admin',
  'api',
  'auth',
  'board',
  'boards',
  'dashboard',
  'help',
  'home',
  'legal',
  'login',
  'logout',
  'marketplace',
  'me',
  'preferences',
  'privacy',
  'profile',
  'root',
  'settings',
  'signin',
  'signout',
  'signup',
  'support',
  'system',
  'template',
  'templates',
  'terms',
  'u',
  'user',
  'users',
  'workspace',
] as const

export const normalizeHandleInput = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, MAX_HANDLE_LENGTH)

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
  pronouns: string | null
}
