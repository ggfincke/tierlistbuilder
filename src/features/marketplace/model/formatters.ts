// src/features/marketplace/model/formatters.ts
// shared display formatters for marketplace counts, dates, & error messages

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

// short count formatter — 1.4M / 12.3k / 870. drops trailing .0 so 1.0k -> 1k
export const formatCount = (n: number): string =>
{
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000)
  {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (n >= 1_000)
  {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(Math.round(n))
}

// granular pluralization for compact stat strings
export const pluralize = (
  n: number,
  singular: string,
  plural?: string
): string => (n === 1 ? singular : (plural ?? `${singular}s`))

// relative-time string anchored at the given epoch ms (default now). uses the
// same coarse buckets as the workspace's "Recently deleted" surface
export const formatRelativeTime = (
  iso: number | string,
  now = Date.now()
): string =>
{
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const diffMs = Math.max(0, now - ms)
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays < 1) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

// rough time-to-rank estimate for an item set; assumes ~3s per item & rounds
// up so the marketing copy errs slightly long rather than short
export const formatTimeToRank = (itemCount: number): string =>
{
  const seconds = Math.max(0, itemCount) * 3
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

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
