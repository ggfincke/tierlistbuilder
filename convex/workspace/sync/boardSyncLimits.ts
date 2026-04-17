// convex/workspace/sync/boardSyncLimits.ts
// shared sync bounds for board state payloads. retention constants live in
// the contracts package; callers import them directly from there

export const MAX_SYNC_TIERS = 50
export const MAX_SYNC_ITEMS = 2000
export const BOARD_TIER_TAKE_LIMIT = MAX_SYNC_TIERS * 2
export const BOARD_ITEM_TAKE_LIMIT = MAX_SYNC_ITEMS * 2
