// src/features/platform/sync/lib/convexErrorCode.ts
// reads the structured { code } payload from ConvexErrors so drainers can
// distinguish permanent failures (forbidden, not_found) from retriable ones

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

// module-scope Set for O(1) code -> branded lookup; hot-path checks run on
// every retried mutation so the per-call Object.values allocation mattered
const KNOWN_CONVEX_ERROR_CODES: ReadonlySet<string> = new Set(
  Object.values(CONVEX_ERROR_CODES)
)

// extract the code from a ConvexError's data payload, or null for any other
// error shape — null means retriable transport failure (no structured code)
export const getConvexErrorCode = (error: unknown): ConvexErrorCode | null =>
{
  if (!(error instanceof ConvexError)) return null

  const data = error.data as { code?: unknown } | null | undefined
  if (!data || typeof data !== 'object') return null

  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null

  return KNOWN_CONVEX_ERROR_CODES.has(code) ? (code as ConvexErrorCode) : null
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

// true when the error will never succeed on retry, so retry loops should
// drop the sidecar entry rather than back off
export const isPermanentConvexError = (error: unknown): boolean =>
{
  const code = getConvexErrorCode(error)
  return code !== null && PERMANENT_CONVEX_ERROR_CODES.has(code)
}
