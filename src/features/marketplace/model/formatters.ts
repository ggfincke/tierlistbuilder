// src/features/marketplace/model/formatters.ts
// marketplace-specific Convex error message formatting

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

const extractConvexErrorCode = (error: unknown): ConvexErrorCode | null =>
{
  if (!(error instanceof ConvexError)) return null
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

const extractInvalidInputMessage = (error: unknown): string =>
{
  if (
    error instanceof ConvexError &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'message' in error.data &&
    typeof (error.data as { message: unknown }).message === 'string'
  )
  {
    return (error.data as { message: string }).message
  }
  return 'Some of those fields are invalid.'
}

// Partial lookup so codes not present here fall through to `fallback`. Using
// ConvexErrorCode directly forces this map to be revisited when new codes
// are added — but only the ones w/ marketplace-specific copy need entries
const MARKETPLACE_ERROR_MESSAGES: Partial<
  Record<ConvexErrorCode, string | ((error: unknown) => string)>
> = {
  [CONVEX_ERROR_CODES.unauthenticated]: 'Sign in to continue.',
  [CONVEX_ERROR_CODES.forbidden]: "You don't have permission to do that.",
  [CONVEX_ERROR_CODES.notFound]: 'That template is no longer available.',
  [CONVEX_ERROR_CODES.invalidInput]: extractInvalidInputMessage,
  [CONVEX_ERROR_CODES.invalidState]: 'That action is not allowed right now.',
  [CONVEX_ERROR_CODES.boardDeleted]: 'That board has been deleted.',
  [CONVEX_ERROR_CODES.rateLimited]:
    "You're publishing too fast — try again in a minute.",
  [CONVEX_ERROR_CODES.payloadTooLarge]: 'That file is too big to upload.',
  [CONVEX_ERROR_CODES.syncLimitExceeded]:
    'That board is too large to publish as a template.',
  [CONVEX_ERROR_CODES.cloudItemLimitExceeded]:
    'That board is too large for cloud-backed publishing.',
  [CONVEX_ERROR_CODES.largeTemplateRequiresPlus]:
    'Large templates require Plus.',
  [CONVEX_ERROR_CODES.largeTemplateFeatureNotReady]:
    'Large template publishing is not available yet.',
  [CONVEX_ERROR_CODES.publishPausedForPlan]:
    'Publishing is paused for this plan.',
}

export const formatMarketplaceError = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string =>
{
  const code = extractConvexErrorCode(error)
  if (!code) return fallback
  const handler = MARKETPLACE_ERROR_MESSAGES[code]
  if (handler === undefined) return fallback
  return typeof handler === 'function' ? handler(error) : handler
}
