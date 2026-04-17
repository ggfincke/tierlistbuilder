// packages/contracts/platform/errors.ts
// shared error-code tokens thrown by convex mutations & matched by the
// frontend drainers. substring-matching on message text is brittle — the
// server emits ConvexError w/ a structured `{ code }` payload, & the client
// inspects `error.data?.code` to decide fatal-drop vs retry

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
} as const

export type ConvexErrorCode =
  (typeof CONVEX_ERROR_CODES)[keyof typeof CONVEX_ERROR_CODES]

export interface ConvexErrorPayload
{
  code: ConvexErrorCode
  message: string
}
