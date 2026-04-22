// src/features/workspace/boards/model/contract.ts
// * serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '@/shared/types/ids'
import type { TierColorSpec } from '@/shared/types/theme'
import type { ImageFit } from '@/shared/board-ui/constants'

// re-exported so feature code can import ImageFit alongside the board shapes
// that reference it; canonical definition lives in shared/board-ui/constants
export type { ImageFit }

// 'auto' recomputes from majority of item ratios on import; 'manual' pins
export type ItemAspectRatioMode = 'auto' | 'manual'

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
  // natural image aspect ratio (w/h); lazy-backfilled on load if absent
  aspectRatio?: number
  // per-item crop override; absent -> board default, then global 'cover'
  imageFit?: ImageFit
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
  // slot aspect ratio (w/h); absent -> 1 (square)
  itemAspectRatio?: number
  // 'auto' tracks content, 'manual' pins to itemAspectRatio; absent -> 'auto'
  itemAspectRatioMode?: ItemAspectRatioMode
  // suppresses the mixed-ratio modal on this board; absent -> not suppressed
  aspectRatioPromptDismissed?: boolean
  // board-wide fit when item has no override; absent -> 'cover'
  defaultItemImageFit?: ImageFit
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
  // natural image aspect ratio (w/h), computed at import
  aspectRatio?: number
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
