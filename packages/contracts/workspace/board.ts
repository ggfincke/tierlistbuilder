// packages/contracts/workspace/board.ts
// * serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '../lib/ids'
import type { TierColorSpec } from '../lib/theme'

// default board title used across local & cloud-backed board creation
export const DEFAULT_BOARD_TITLE = 'My Tier List'

// hard cap for user-supplied board titles
export const MAX_BOARD_TITLE_LENGTH = 200

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

// single item placed in a tier or the unranked pool
export interface TierItem
{
  // unique identifier
  id: ItemId
  // content-addressable reference to a stored image
  imageRef?: TierItemImageRef
  // inline data URL fallback used while migrating legacy boards or when
  // IndexedDB is unavailable
  imageUrl?: string
  // optional display label (derived from filename on upload, required for text-only)
  label?: string
  // hex background color used when imageRef is absent
  backgroundColor?: string
  // custom alt text for screen readers (falls back to label)
  altText?: string
}

// a single tier row w/ ordered item references
export interface Tier
{
  // unique identifier
  id: TierId
  // display name shown in the label cell
  name: string
  // optional subtitle text displayed beneath the name
  description?: string
  // canonical color spec for the label background
  colorSpec: TierColorSpec
  // optional color spec for the entire row's background (behind items);
  // absent means the row uses the theme's surface token
  rowColorSpec?: TierColorSpec
  // ordered list of item IDs assigned to this tier
  itemIds: ItemId[]
}

// full serializable board snapshot — persisted per board & exchanged across import/export
export interface BoardSnapshot
{
  // board title shown in the toolbar
  title: string
  // ordered list of tier rows
  tiers: Tier[]
  // item IDs in the unranked pool (not yet assigned to a tier)
  unrankedItemIds: ItemId[]
  // map of all items keyed by ID
  items: Record<ItemId, TierItem>
  // recently deleted items available for restore (newest first, capped at 50)
  deletedItems: TierItem[]
}

// payload for adding new items (before IDs are assigned). the image
// resizer is responsible for writing the blob to the IndexedDB store &
// passing the resulting hash here
export interface NewTierItem
{
  // content-addressable reference to an already-stored image
  imageRef?: TierItemImageRef
  // inline data URL fallback when the local image store is unavailable
  imageUrl?: string
  // optional label derived from the source filename, required for text-only items
  label?: string
  // hex background color for text-only items
  backgroundColor?: string
}

// wire-format variant of `TierItem` used at JSON import/export boundaries
// & at the share-link encode layer. carries a base64 `imageUrl` so exported
// files stay self-contained — the import path decodes the base64 back into
// the IndexedDB store & produces a `TierItem` w/ `imageRef` instead
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
  // unique board identifier
  id: BoardId
  // display title (kept in sync w/ BoardSnapshot.title)
  title: string
  // epoch millis when the board was created
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
