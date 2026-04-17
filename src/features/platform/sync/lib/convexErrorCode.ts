// src/features/platform/sync/lib/convexErrorCode.ts
// reads the structured { code } payload from ConvexErrors so drainers can
// distinguish permanent failures (forbidden, not_found) from retriable ones

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

// extract the code from a ConvexError's data payload, or null for any other
// error shape — null means retriable transport failure (no structured code)
export const getConvexErrorCode = (error: unknown): ConvexErrorCode | null =>
{
  if (!(error instanceof ConvexError)) return null

  const data = error.data as { code?: unknown } | null | undefined
  if (!data || typeof data !== 'object') return null

  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null

  const knownCodes = Object.values(CONVEX_ERROR_CODES) as string[]
  return knownCodes.includes(code) ? (code as ConvexErrorCode) : null
}

// codes that mean the mutation will never succeed — allocated at module load
// for O(1) hot-path lookup. rateLimited & unauthenticated are excluded: both
// are transient (bucket resets; token refreshes or next sign-in clears it)
const PERMANENT_CONVEX_ERROR_CODES: ReadonlySet<string> = new Set([
  CONVEX_ERROR_CODES.forbidden,
  CONVEX_ERROR_CODES.notFound,
  CONVEX_ERROR_CODES.invalidState,
  CONVEX_ERROR_CODES.invalidInput,
  CONVEX_ERROR_CODES.payloadTooLarge,
  CONVEX_ERROR_CODES.syncLimitExceeded,
  CONVEX_ERROR_CODES.boardDeleted,
])

// is-this-a-permanent-failure predicate used by the board-delete drainer &
// similar retry loops. true means dropping the sidecar entry is correct
// because the mutation will never succeed for this input
export const isPermanentConvexError = (error: unknown): boolean =>
{
  const code = getConvexErrorCode(error)
  return code !== null && PERMANENT_CONVEX_ERROR_CODES.has(code)
}

// pull retryAfter from the ConvexError payload so drainers honor the server's
// backoff hint. returns null if not a rate-limit error or retryAfter is absent
export const getRateLimitRetryAfter = (error: unknown): number | null =>
{
  const code = getConvexErrorCode(error)
  if (code !== CONVEX_ERROR_CODES.rateLimited) return null
  if (!(error instanceof ConvexError)) return null

  const data = error.data as { retryAfter?: unknown } | null | undefined
  if (!data || typeof data !== 'object') return null
  const retryAfter = (data as { retryAfter?: unknown }).retryAfter
  return typeof retryAfter === 'number' && Number.isFinite(retryAfter)
    ? retryAfter
    : null
}
