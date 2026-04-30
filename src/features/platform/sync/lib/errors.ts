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

const getConvexErrorData = (error: unknown): Record<string, unknown> | null =>
{
  if (error instanceof ConvexError)
  {
    return typeof error.data === 'object' && error.data !== null
      ? (error.data as Record<string, unknown>)
      : null
  }

  if (typeof error !== 'object' || error === null || !('data' in error))
  {
    return null
  }

  const data = (error as { data?: unknown }).data
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)
    : null
}

export const getConvexErrorCode = (error: unknown): ConvexErrorCode | null =>
{
  const data = getConvexErrorData(error)
  const code = data?.code
  if (typeof code !== 'string') return null

  return KNOWN_CONVEX_ERROR_CODES.has(code) ? (code as ConvexErrorCode) : null
}

export const getConvexRetryAfterMs = (error: unknown): number | null =>
{
  const data = getConvexErrorData(error)
  const retryAfter = data?.retryAfter
  return typeof retryAfter === 'number' &&
    Number.isFinite(retryAfter) &&
    retryAfter >= 0
    ? retryAfter
    : null
}

export const isRateLimitedError = (error: unknown): boolean =>
  getConvexErrorCode(error) === CONVEX_ERROR_CODES.rateLimited

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

export type PermanentSyncErrorCode = 'missing-local-image-blobs'

// typed restore error for user-friendly toast mapping; raw error stays on cause
export class RestoreBoardError extends Error
{
  readonly code: RestoreErrorCode

  constructor(code: RestoreErrorCode, message: string, cause?: unknown)
  {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RestoreBoardError'
    this.code = code
  }
}

export class PermanentSyncError extends Error
{
  readonly code: PermanentSyncErrorCode
  readonly permanent = true

  constructor(code: PermanentSyncErrorCode, message: string, cause?: unknown)
  {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'PermanentSyncError'
    this.code = code
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
      retryAfter: number | null
      cause: unknown
    }
  | {
      kind: 'restore'
      code: RestoreErrorCode
      permanent: boolean
      cause: unknown
    }
  | {
      kind: 'local-permanent'
      code: PermanentSyncErrorCode
      permanent: true
      cause: unknown
    }
  | { kind: 'unknown'; permanent: false; cause: unknown }

const isPermanentRestoreCode = (code: RestoreErrorCode): boolean =>
  code === 'concurrent-hard-delete' || code === 'persist-failed'

const SYNC_ERROR_KINDS: ReadonlySet<SyncError['kind']> = new Set([
  'offline',
  'convex',
  'restore',
  'local-permanent',
  'unknown',
])

const isClassifiedSyncError = (error: unknown): error is SyncError =>
{
  if (typeof error !== 'object' || error === null)
  {
    return false
  }

  const kind = (error as { kind?: unknown }).kind
  const permanent = (error as { permanent?: unknown }).permanent
  return (
    typeof kind === 'string' &&
    SYNC_ERROR_KINDS.has(kind as SyncError['kind']) &&
    typeof permanent === 'boolean'
  )
}

export const classifySyncError = (error: unknown): SyncError =>
{
  if (isClassifiedSyncError(error))
  {
    return error
  }

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

  if (error instanceof PermanentSyncError)
  {
    return {
      kind: 'local-permanent',
      code: error.code,
      permanent: true,
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
      retryAfter: getConvexRetryAfterMs(error),
      cause: error,
    }
  }

  return { kind: 'unknown', permanent: false, cause: error }
}

export const getRateLimitRetryAfterMs = (error: SyncError): number | null =>
  error.kind === 'convex' && error.code === CONVEX_ERROR_CODES.rateLimited
    ? error.retryAfter
    : null
