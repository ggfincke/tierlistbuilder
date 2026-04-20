// packages/contracts/workspace/board.ts
// * serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '../lib/ids'
import type { TierColorSpec } from '../lib/theme'

// default board title used across local & cloud-backed board creation
export const DEFAULT_BOARD_TITLE = 'My Tier List'

// hard cap for user-supplied board titles
export const MAX_BOARD_TITLE_LENGTH = 200

// soft-delete retention window before the daily hard-delete cron purges a board.
// exposed in contracts (not just Convex-internal) so the "Recently deleted" UI
// can compute the permanent-deletion date w/o a server round trip
export const BOARD_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// trim board titles & fall back to the shared default
export const normalizeBoardTitle = (raw: string): string =>
{
  const trimmed = raw.trim()
  if (!trimmed)
  {
    return DEFAULT_BOARD_TITLE
  }

  return trimmed.length > MAX_BOARD_TITLE_LENGTH
    ? trimmed.slice(0, MAX_BOARD_TITLE_LENGTH)
    : trimmed
}

// content-addressable image pointer for bytes stored outside the snapshot
export interface TierItemImageRef
{
  hash: string
  cloudMediaExternalId?: string
}

// single item placed in a tier or the unranked pool. `imageUrl` is an inline
// fallback used when imported image bytes can't be persisted locally yet
export interface TierItem
{
  id: ItemId
  imageRef?: TierItemImageRef
  imageUrl?: string
  label?: string
  backgroundColor?: string
  altText?: string
}

// a single tier row w/ ordered item references
export interface Tier
{
  id: TierId
  name: string
  description?: string
  colorSpec: TierColorSpec
  rowColorSpec?: TierColorSpec
  itemIds: ItemId[]
}

// full serializable board snapshot — persisted per board & exchanged across import/export
export interface BoardSnapshot
{
  title: string
  tiers: Tier[]
  unrankedItemIds: ItemId[]
  items: Record<ItemId, TierItem>
  deletedItems: TierItem[]
}

// payload for adding new items (before IDs are assigned). the image
// resizer is responsible for writing the blob to the IndexedDB store &
// passing the resulting hash here
export interface NewTierItem
{
  imageRef?: TierItemImageRef
  label?: string
  backgroundColor?: string
}

// wire-format TierItem used at JSON import/export & share-link encode boundaries.
// carries a base64 `imageUrl` so exports are self-contained; the import path
// decodes it into IndexedDB & produces a TierItem w/ `imageRef` instead
export interface TierItemWire
{
  id: ItemId
  imageUrl?: string
  label?: string
  backgroundColor?: string
  altText?: string
}

// wire-format variant of `BoardSnapshot` — same shape as in-memory but
// items carry inline base64 image bytes instead of IndexedDB references
export interface BoardSnapshotWire
{
  title: string
  tiers: Tier[]
  unrankedItemIds: ItemId[]
  items: Record<ItemId, TierItemWire>
  deletedItems: TierItemWire[]
}

// metadata entry for a single board in the multi-board registry
export interface BoardMeta
{
  id: BoardId
  title: string
  createdAt: number
}

// cloud board list row returned by the Convex board listing queries
export interface BoardListItem
{
  externalId: string
  title: string
  createdAt: number
  updatedAt: number
  revision: number
}

// extended cloud board list row for the "Recently deleted" surface. carries
// deletedAt so the client can sort + display "Will be permanently deleted in
// N days" by adding BOARD_TOMBSTONE_RETENTION_MS
export interface DeletedBoardListItem extends BoardListItem
{
  deletedAt: number
}
