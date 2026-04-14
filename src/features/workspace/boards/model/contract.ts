// src/features/workspace/boards/model/contract.ts
// * serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '@/shared/types/ids'
import type { TierColorSpec } from '@/shared/types/theme'

// single item placed in a tier or the unranked pool
export interface TierItem
{
  // unique identifier
  id: ItemId
  // base64 data URL or image path (absent for text-only items)
  imageUrl?: string
  // optional display label (derived from filename on upload, required for text-only)
  label?: string
  // hex background color used when imageUrl is absent
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

// payload for adding new items (before IDs are assigned)
export interface NewTierItem
{
  // base64 data URL produced by the image resizer (absent for text-only items)
  imageUrl?: string
  // optional label derived from the source filename, required for text-only items
  label?: string
  // hex background color for text-only items
  backgroundColor?: string
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
