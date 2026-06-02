// convex/lib/limits.ts
// shared sync bounds for board state payloads. retention constants live in
// the contracts package; callers import them directly from there

import {
  MAX_CLOUD_BOARD_TIERS,
  MAX_LARGE_CLOUD_BOARD_ITEMS,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
export {
  MAX_TIER_DESCRIPTION_LEN,
  MAX_TIER_NAME_LEN,
} from '@tierlistbuilder/contracts/workspace/board'

export const MAX_SYNC_TIERS = MAX_CLOUD_BOARD_TIERS
export const MAX_SYNC_ITEMS = MAX_LARGE_CLOUD_BOARD_ITEMS
export const BOARD_TIER_TAKE_LIMIT = MAX_SYNC_TIERS * 2
export const BOARD_ITEM_TAKE_LIMIT = MAX_SYNC_ITEMS * 2
export const MAX_AGGREGATE_SEARCH_LENGTH = 80

// per-op batch sizes for scheduled / crons workloads
export const BATCH_LIMITS = {
  // hard-delete scheduler picks up this many soft-deleted boards per tick
  hardDeleteSchedule: 64,
  // item-tombstone GC hard-deletes this many aged boardItems per batch. higher
  // than board hard-delete since each delete is a leaf row w/ no cascade
  itemTombstoneGc: 256,
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
  // ranking release transitions also touch source boards & aggregate lanes
  rankingSeedLifecycleTransition: 32,
  // seed-gated homepage curation should stay small & transaction-bounded
  featuredTemplateScan: 64,
} as const

// per-op limits for the marketplace seed pipeline. mirror these on the Python
// side (scripts/seed_pipeline/seed_pipeline/runs.py) — they MUST match or
// upserts will fail at the validator boundary
export const SEED_LIMITS = {
  stateIds: 8192,
  templatesPerDiff: 2048,
  itemsPerTemplate: 4096,
  mediaVariantsPerHash: 64,
  uploadUrlsPerCall: 128,
  mediaAssetsPerFinalize: 64,
  storageIdsPerCleanup: 256,
  templateUpsertsPerCall: 128,
  itemUpsertsPerCall: 4096,
  styleUpsertsPerCall: 128,
  styleItemUpsertsPerCall: 4096,
  stylesPerTemplate: 32,
  criterionUpsertsPerCall: 512,
  rankingSeedRowsPerRelease: 4096,
  rankingSeedItemsPerRanking: 4096,
  rankingSeedTiersPerRanking: 64,
  // bound the byDatasetStatus scan in resolveActiveSeedRuns. one row per
  // (dataset, releaseId, runId) for runs in status='active'; in steady state
  // there's at most one but multi-active windows during rollout are possible
  activeRunsPerDataset: 32,
} as const

export const SEED_UPLOAD_URL_TTL_MS = 60 * 60 * 1000
