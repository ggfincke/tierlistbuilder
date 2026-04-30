// src/features/marketplace/model/formatters.ts
// marketplace-specific Convex error message formatting

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

// extract a Convex error code out of a thrown value if present
export const extractConvexErrorCode = (
  error: unknown
): ConvexErrorCode | null =>
{
  if (!(error instanceof ConvexError))
  {
    return null
  }
  const data = error.data
  if (typeof data === 'object' && data !== null && 'code' in data)
  {
    const code = (data as { code: unknown }).code
    if (typeof code === 'string')
    {
      return code as ConvexErrorCode
    }
  }
  return null
}

// map a Convex error to a user-readable string for marketplace toasts
export const formatMarketplaceError = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string =>
{
  const code = extractConvexErrorCode(error)
  if (code === CONVEX_ERROR_CODES.unauthenticated)
  {
    return 'Sign in to continue.'
  }
  if (code === CONVEX_ERROR_CODES.forbidden)
  {
    return "You don't have permission to do that."
  }
  if (code === CONVEX_ERROR_CODES.notFound)
  {
    return 'That template is no longer available.'
  }
  if (code === CONVEX_ERROR_CODES.invalidInput)
  {
    return error instanceof ConvexError &&
      typeof error.data === 'object' &&
      error.data !== null &&
      'message' in error.data &&
      typeof (error.data as { message: unknown }).message === 'string'
      ? ((error.data as { message: string }).message as string)
      : 'Some of those fields are invalid.'
  }
  if (code === CONVEX_ERROR_CODES.invalidState)
  {
    return 'That action is not allowed right now.'
  }
  if (code === CONVEX_ERROR_CODES.boardDeleted)
  {
    return 'That board has been deleted.'
  }
  if (code === CONVEX_ERROR_CODES.rateLimited)
  {
    return "You're publishing too fast — try again in a minute."
  }
  if (code === CONVEX_ERROR_CODES.payloadTooLarge)
  {
    return 'That file is too big to upload.'
  }
  if (code === CONVEX_ERROR_CODES.syncLimitExceeded)
  {
    return 'That board is too large to publish as a template.'
  }
  return fallback
}
