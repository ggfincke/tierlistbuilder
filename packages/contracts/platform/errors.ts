// packages/contracts/platform/errors.ts
// error-code tokens thrown by Convex mutations & matched by frontend drainers.
// server emits ConvexError w/ `{ code }`; client checks `error.data?.code` for fatal-drop vs retry

export const CONVEX_ERROR_CODES = {
  forbidden: 'forbidden',
  notFound: 'not_found',
  invalidState: 'invalid_state',
  payloadTooLarge: 'payload_too_large',
  slugAllocationFailed: 'slug_allocation_failed',
  storageMissing: 'storage_missing',
  unauthenticated: 'unauthenticated',
  rateLimited: 'rate_limited',
  invalidInput: 'invalid_input',
  syncLimitExceeded: 'sync_limit_exceeded',
  boardDeleted: 'board_deleted',
} as const

export type ConvexErrorCode =
  (typeof CONVEX_ERROR_CODES)[keyof typeof CONVEX_ERROR_CODES]
