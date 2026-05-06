// convex/lib/limits.ts
// shared sync bounds for board state payloads. retention constants live in
// the contracts package; callers import them directly from there

import {
  MAX_CLOUD_BOARD_TIERS,
  MAX_LARGE_CLOUD_BOARD_ITEMS,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'

export const MAX_SYNC_TIERS = MAX_CLOUD_BOARD_TIERS
export const MAX_SYNC_ITEMS = MAX_LARGE_CLOUD_BOARD_ITEMS
export const BOARD_TIER_TAKE_LIMIT = MAX_SYNC_TIERS * 2
export const BOARD_ITEM_TAKE_LIMIT = MAX_SYNC_ITEMS * 2
export const MAX_AGGREGATE_SEARCH_LENGTH = 80

// per-op batch sizes for scheduled / crons workloads
export const BATCH_LIMITS = {
  // hard-delete scheduler picks up this many soft-deleted boards per tick
  hardDeleteSchedule: 64,
  // media GC scans this many image rows per batch
  mediaGc: 64,
  // storage GC cleans this many orphaned storage blobs per batch
  storageGc: 64,
  // expired-link cleanup removes this many short-links per batch
  expiredLink: 64,
  // cascading board deletion pages through tiers & items this many at a time
  cascadeDelete: 256,
  // large template publish/clone jobs copy rows in bounded transactions
  templateCopyJob: 100,
  // trending recompute reads card rows plus 7 metric rows per template
  templateTrendingRecompute: 64,
  // aggregate scheduler scans public template cards for missing/stale rows
  templateRankingAggregateSchedule: 32,
  // seed one aggregate row per template item in bounded transactions
  templateRankingAggregateSeedItems: 100,
  // process ranking snapshots in pages so each write batch stays bounded
  templateRankingAggregateRankingItems: 80,
  // cleanup old aggregate generations after a new one becomes active
  templateRankingAggregateCleanup: 256,
} as const
