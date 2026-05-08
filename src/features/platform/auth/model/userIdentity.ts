// src/features/platform/auth/model/userIdentity.ts
// display-name & sync-id helpers for public user identity projections

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { extractInitial } from '~/shared/lib/initials'

type DisplayUser = Pick<PublicUserMe, 'displayName' | 'name' | 'email'>
type StableUser = Pick<PublicUserMe, '_id'>

type EmailFallback = 'full' | 'local' | 'omit'

interface DisplayNameOptions
{
  email?: EmailFallback
}

const getEmailFallback = (
  email: string | null,
  mode: EmailFallback
): string | null =>
{
  if (!email || mode === 'omit')
  {
    return null
  }
  return mode === 'local' ? email.split('@')[0] : email
}

export const getDisplayName = (
  user: DisplayUser,
  fallback = 'Signed in',
  options: DisplayNameOptions = {}
): string =>
{
  const emailMode = options.email ?? 'full'
  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    getEmailFallback(user.email, emailMode) ||
    fallback
  )
}

export const getUserInitial = (user: DisplayUser, fallback = 'U'): string =>
  extractInitial(getDisplayName(user, fallback), fallback)

export const getUserStableId = (user: StableUser): string => user._id
