// src/features/platform/sync/convexErrorCode.ts
// read the structured { code } payload from a ConvexError thrown by server
// mutations/queries. drainers use this to distinguish permanent failures
// (forbidden, not_found) from retriable ones (network, offline)

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

// extract the code from a ConvexError's data payload, or null for any other
// error shape. null is meaningful: it means the error wasn't produced by a
// server mutation w/ structured codes, so the caller must fall back to
// treating it as a retriable transport failure
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

// is-this-a-permanent-failure predicate used by the board-delete drainer &
// similar retry loops. true means dropping the sidecar entry is correct
// because the mutation will never succeed for this input
export const isPermanentConvexError = (error: unknown): boolean =>
{
  const code = getConvexErrorCode(error)
  return (
    code === CONVEX_ERROR_CODES.forbidden ||
    code === CONVEX_ERROR_CODES.notFound
  )
}
