// convex/workspace/sync/boardSyncLimits.ts
// shared sync bounds & retention constants for board state payloads

export const MAX_SYNC_TIERS = 50
export const MAX_SYNC_ITEMS = 2000
export const BOARD_TIER_TAKE_LIMIT = MAX_SYNC_TIERS * 2
export const BOARD_ITEM_TAKE_LIMIT = MAX_SYNC_ITEMS * 2
export const BOARD_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
