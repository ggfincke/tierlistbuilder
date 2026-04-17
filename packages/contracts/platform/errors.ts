// packages/contracts/platform/errors.ts
// error-code tokens thrown by Convex mutations & matched by frontend drainers.
// server emits ConvexError w/ `{ code }`; client checks `error.data?.code` for fatal-drop vs retry

export const CONVEX_ERROR_CODES = {
  // caller owns no row matching the externalId (or the row is deleted &
  // the caller wasn't the owner). drainers treat this as a permanent
  // failure & clear the sidecar entry
  forbidden: 'forbidden',
  // target row never existed. drainers drop the sidecar entry as well
  notFound: 'not_found',
  // row exists but is in a state that disallows the requested op
  // (e.g. permanentlyDeleteBoard on an active row)
  invalidState: 'invalid_state',
  // upload-size cap exceeded; client should not retry w/o a smaller payload
  payloadTooLarge: 'payload_too_large',
  // collision-retry exhausted; extremely rare (218T base62 space), client
  // may retry the whole flow after a delay
  slugAllocationFailed: 'slug_allocation_failed',
  // referenced _storage blob is missing — upload was dropped or race w/ GC
  storageMissing: 'storage_missing',
  // caller has no authenticated session — distinct from forbidden so the
  // client can prompt sign-in rather than treat as ACL failure
  unauthenticated: 'unauthenticated',
  // per-caller quota exhausted — client backs off & retries after a delay.
  // NOT permanent: drainers keep the sidecar entry & re-try on next cycle
  rateLimited: 'rate_limited',
  // malformed caller input that schema validators can't enforce (hex-format
  // mismatch, externalId prefix violation, oversized label, etc.). permanent
  // — drainer drops sidecar & surfaces to the user
  invalidInput: 'invalid_input',
  // board-shaped sync limit (tier count, item count, row-read cap) exceeded.
  // permanent — the client's data would need to shrink before retry succeeds
  syncLimitExceeded: 'sync_limit_exceeded',
  // sync target is soft-deleted; the client should drop the pending write &
  // reconcile against the tombstone flow instead of retrying
  boardDeleted: 'board_deleted',
} as const

export type ConvexErrorCode =
  (typeof CONVEX_ERROR_CODES)[keyof typeof CONVEX_ERROR_CODES]

export interface ConvexErrorPayload
{
  code: ConvexErrorCode
  message: string
}
