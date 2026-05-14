// src/features/platform/auth/model/authErrors.ts
// Maps Convex Auth error codes/messages to copy safe for the sign-in surface.

import { logger } from '~/shared/lib/logger'

export type AuthMode = 'sign-in' | 'sign-up'

export const mapAuthError = (message: string, mode: AuthMode): string =>
{
  const lower = message.toLowerCase()
  const compact = lower.replace(/[^a-z0-9]/g, '')
  if (
    compact.includes('invalidaccountid') ||
    compact.includes('invalidsecret')
  )
  {
    return mode === 'sign-in'
      ? 'Wrong email or password.'
      : 'Could not create account — try a different email.'
  }
  if (lower.includes('account already exists') || lower.includes('exists'))
  {
    return 'An account with that email already exists.'
  }
  if (lower.includes('password') && lower.includes('characters'))
  {
    return 'Password must be at least 8 characters.'
  }
  logger.debug('auth', 'Unmapped auth error:', message)
  return 'Something went wrong. Please try again.'
}
