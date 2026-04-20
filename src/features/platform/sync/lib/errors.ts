// src/features/platform/sync/lib/errors.ts
// unified sync-layer error vocabulary — offline sentinel, ConvexError codes,
// restore errors, & classifySyncError for schedulers to fail-fast on permanents

import { ConvexError } from 'convex/values'
import {
  CONVEX_ERROR_CODES,
  type ConvexErrorCode,
} from '@tierlistbuilder/contracts/platform/errors'

// -------- offline sentinel ---------------------------------------------------

export const OFFLINE_SENTINEL = 'offline'

export const makeOfflineError = (): Error => new Error(OFFLINE_SENTINEL)

export const isOfflineError = (error: unknown): boolean =>
  error instanceof Error && error.message === OFFLINE_SENTINEL

// -------- ConvexError code extraction ---------------------------------------

// module-scope Set for O(1) code -> branded lookup
const KNOWN_CONVEX_ERROR_CODES: ReadonlySet<string> = new Set(
  Object.values(CONVEX_ERROR_CODES)
)

export const getConvexErrorCode = (error: unknown): ConvexErrorCode | null =>
{
  if (!(error instanceof ConvexError)) return null

  const data = error.data as { code?: unknown } | null | undefined
  if (!data || typeof data !== 'object') return null

  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null

  return KNOWN_CONVEX_ERROR_CODES.has(code) ? (code as ConvexErrorCode) : null
}

// codes that will never succeed on retry — rateLimited & unauthenticated are
// excluded since both are transient (bucket resets; next sign-in refreshes)
const PERMANENT_CONVEX_ERROR_CODES: ReadonlySet<string> = new Set([
  CONVEX_ERROR_CODES.forbidden,
  CONVEX_ERROR_CODES.notFound,
  CONVEX_ERROR_CODES.invalidState,
  CONVEX_ERROR_CODES.invalidInput,
  CONVEX_ERROR_CODES.payloadTooLarge,
  CONVEX_ERROR_CODES.syncLimitExceeded,
  CONVEX_ERROR_CODES.boardDeleted,
])

export const isPermanentConvexError = (error: unknown): boolean =>
{
  const code = getConvexErrorCode(error)
  return code !== null && PERMANENT_CONVEX_ERROR_CODES.has(code)
}

// -------- restore-path error class ------------------------------------------

export type RestoreErrorCode =
  | 'concurrent-hard-delete'
  | 'persist-failed'
  | 'cloud-error'

// typed restore error for user-friendly toast mapping; raw error stays on cause
export class RestoreBoardError extends Error
{
  readonly code: RestoreErrorCode

  constructor(code: RestoreErrorCode, message: string, cause?: unknown)
  {
    super(message)
    this.name = 'RestoreBoardError'
    this.code = code
    if (cause !== undefined)
    {
      ;(this as { cause?: unknown }).cause = cause
    }
  }
}

// -------- unified classifier ------------------------------------------------

// discriminated shape every sync caller can pattern-match against. `permanent`
// is carried on every variant so fail-fast decisions don't need per-variant
// branching — schedulers just read `.permanent` & drop retries accordingly
export type SyncError =
  | { kind: 'offline'; permanent: false; cause: unknown }
  | {
      kind: 'convex'
      code: ConvexErrorCode
      permanent: boolean
      cause: unknown
    }
  | {
      kind: 'restore'
      code: RestoreErrorCode
      permanent: boolean
      cause: unknown
    }
  | { kind: 'unknown'; permanent: false; cause: unknown }

const isPermanentRestoreCode = (code: RestoreErrorCode): boolean =>
  code === 'concurrent-hard-delete' || code === 'persist-failed'

export const classifySyncError = (error: unknown): SyncError =>
{
  if (isOfflineError(error))
  {
    return { kind: 'offline', permanent: false, cause: error }
  }

  if (error instanceof RestoreBoardError)
  {
    return {
      kind: 'restore',
      code: error.code,
      permanent: isPermanentRestoreCode(error.code),
      cause: error,
    }
  }

  const convexCode = getConvexErrorCode(error)
  if (convexCode !== null)
  {
    return {
      kind: 'convex',
      code: convexCode,
      permanent: PERMANENT_CONVEX_ERROR_CODES.has(convexCode),
      cause: error,
    }
  }

  return { kind: 'unknown', permanent: false, cause: error }
}
