// packages/contracts/workspace/board.ts
// * serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '../lib/ids'
import type { TierColorSpec } from '../lib/theme'

// default board title used across local board creation
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

// how an image fills its slot when aspect ratios differ; also the canonical
// value type used in per-item overrides & the board-wide default
export type ImageFit = 'cover' | 'contain'

// 'auto' recomputes the board ratio from majority of item ratios on import;
// 'manual' pins the user-selected value
export type ItemAspectRatioMode = 'auto' | 'manual'

// quarter-turn rotation in degrees applied to the rendered image content.
// free rotation is out of scope so the export rasterizer doesn't have to
// handle sub-pixel anti-aliasing on rotated edges
export type ItemRotation = 0 | 90 | 180 | 270

export const ITEM_ROTATIONS: readonly ItemRotation[] = [0, 90, 180, 270]

// per-item manual crop transform layered on top of object-fit:cover. absent
// -> renderer falls back to the imageFit (board default) object-fit path.
// shared imageTransform helpers define runtime semantics
export interface ItemTransform
{
  // 0 | 90 | 180 | 270 clockwise; mirroring intentionally not exposed
  rotation: ItemRotation
  // multiplier over the cover baseline; 1 = no zoom, must be > 0
  zoom: number
  // pan as a signed fraction of cell width; 0 = centered, +0.5 shifts the
  // image half a cell-width right of the cell center
  offsetX: number
  // same convention as offsetX along the vertical axis
  offsetY: number
}

export const ITEM_TRANSFORM_IDENTITY: ItemTransform = {
  rotation: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
}

// soft caps applied by the editor & by import normalization. zoom is bounded
// so a corrupt JSON can't push image size to a sub-pixel speck or gigapixel.
// pan is allowed slightly past the cell so users can bake a margin
export const ITEM_TRANSFORM_LIMITS = {
  zoomMin: 0.1,
  zoomMax: 10,
  offsetMin: -2,
  offsetMax: 2,
} as const

// content-addressable image pointer for bytes stored outside the snapshot
export interface TierItemImageRef
{
  hash: string
}

// single item placed in a tier or the unranked pool. display images live
// behind `imageRef`; optional source refs keep higher-quality local edit bytes
export interface TierItem
{
  id: ItemId
  imageRef?: TierItemImageRef
  sourceImageRef?: TierItemImageRef
  label?: string
  backgroundColor?: string
  altText?: string
  // natural image aspect ratio (w/h) captured at import; absent -> rendered
  // w/ the board default (1:1 when the board has no override)
  aspectRatio?: number
  // per-item crop override; absent -> board default, then global 'cover'.
  // ignored at render time when `transform` is set (manual transform wins)
  imageFit?: ImageFit
  // optional per-item manual crop; absent -> imageFit fallback path
  transform?: ItemTransform
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
  // slot aspect ratio (w/h); absent -> 1 (square)
  itemAspectRatio?: number
  // 'auto' tracks content, 'manual' pins to itemAspectRatio; absent -> 'auto'
  itemAspectRatioMode?: ItemAspectRatioMode
  // suppresses the mixed-ratio modal on this board; absent -> not suppressed
  aspectRatioPromptDismissed?: boolean
  // board-wide fit when item has no override; absent -> 'cover'
  defaultItemImageFit?: ImageFit
}

// payload for adding new items before IDs are assigned. image import writes
// display + editor blobs to IndexedDB & passes the resulting refs here
export interface NewTierItem
{
  imageRef?: TierItemImageRef
  sourceImageRef?: TierItemImageRef
  label?: string
  backgroundColor?: string
  // natural image aspect ratio captured at import time
  aspectRatio?: number
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
  aspectRatio?: number
  imageFit?: ImageFit
  transform?: ItemTransform
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
  itemAspectRatio?: number
  itemAspectRatioMode?: ItemAspectRatioMode
  aspectRatioPromptDismissed?: boolean
  defaultItemImageFit?: ImageFit
}

// metadata entry for a single board in the multi-board registry
export interface BoardMeta
{
  id: BoardId
  title: string
  createdAt: number
}
