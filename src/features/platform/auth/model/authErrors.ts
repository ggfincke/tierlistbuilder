// src/features/platform/auth/model/authErrors.ts
// maps Convex Auth error codes/messages to sign-in-safe copy

import { passwordTooShortMessage } from '@tierlistbuilder/contracts/platform/user'
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
    return passwordTooShortMessage()
  }
  logger.debug('auth', 'Unmapped auth error:', message)
  return 'Something went wrong. Please try again.'
}
