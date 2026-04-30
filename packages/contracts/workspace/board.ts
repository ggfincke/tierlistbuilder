// packages/contracts/workspace/board.ts
// * serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '../lib/ids'
import type { PaletteId, TextStyleId, TierColorSpec } from '../lib/theme'
import { clamp } from '../lib/math'

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

// soft caps applied by the editor & by import normalization. zoom supports
// 1% contain/auto-crop for extreme ratios without letting corrupt JSON shrink
// content to a sub-pixel speck. pan can go slightly past the cell for margin
export const ITEM_TRANSFORM_LIMITS = {
  zoomMin: 0.01,
  zoomMax: 10,
  offsetMin: -2,
  offsetMax: 2,
} as const

// caption placement modes — 'overlay' positions a content-sized block at
// (x, y) ∈ [0, 1] inside the image frame (draggable in the editor);
// 'captionAbove'/'captionBelow' render a full-width strip outside the image
export const LABEL_PLACEMENT_MODES = [
  'overlay',
  'captionAbove',
  'captionBelow',
] as const
export type LabelPlacementMode = (typeof LABEL_PLACEMENT_MODES)[number]

// caption sits inside the image frame; (x, y) is the *center* of the caption
// block (translate(-50%, -50%) at render time). axes normalized to [0, 1]
export interface LabelOverlayPlacement
{
  mode: 'overlay'
  x: number
  y: number
}

export interface LabelCaptionAbovePlacement
{
  mode: 'captionAbove'
}

export interface LabelCaptionBelowPlacement
{
  mode: 'captionBelow'
}

// discriminated union — overlay carries position; caption modes are inline
// strips so they don't need coordinates
export type LabelPlacement =
  | LabelOverlayPlacement
  | LabelCaptionAbovePlacement
  | LabelCaptionBelowPlacement

// default overlay anchor — bottom-center, matches the legacy "overlayBottom"
// behavior so unconfigured boards render the same way
export const LABEL_PLACEMENT_DEFAULT: LabelPlacement = {
  mode: 'overlay',
  x: 0.5,
  y: 0.95,
}

// snap presets surfaced in the editor — center-x w/ three canned y values
// for quick top/middle/bottom alignment without precision dragging
export const LABEL_PLACEMENT_OVERLAY_PRESETS = {
  top: { mode: 'overlay', x: 0.5, y: 0.05 },
  middle: { mode: 'overlay', x: 0.5, y: 0.5 },
  bottom: { mode: 'overlay', x: 0.5, y: 0.95 },
} as const satisfies Record<string, LabelOverlayPlacement>

// scrim style behind overlay labels — 'none' means transparent (text floats
// over the image), 'dark'/'light' draw a translucent bar for readability.
// caption placements ignore scrim (they sit on their own surface)
export const LABEL_SCRIMS = ['none', 'dark', 'light'] as const
export type LabelScrim = (typeof LABEL_SCRIMS)[number]

// overlay-label text color palette. 'auto' inherits the scrim-derived color
// (white over dark scrim, black over light scrim). caption placements ignore
// this; it only applies to overlay text
export const LABEL_TEXT_COLORS = [
  'auto',
  'white',
  'black',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
] as const
export type LabelTextColor = (typeof LABEL_TEXT_COLORS)[number]

// legacy caption-size enum — kept readable as a fallback for older saved
// data; the user-facing control is now a numeric `fontSizePx` (see below)
export const LABEL_SIZE_SCALES = ['sm', 'md', 'lg'] as const
export type LabelSizeScale = (typeof LABEL_SIZE_SCALES)[number]

// caption font-size in CSS px. clamped at the contract level so wire payloads
// can't request absurd values; the editor UI exposes this as a numeric input
export const LABEL_FONT_SIZE_PX_MIN = 8
export const LABEL_FONT_SIZE_PX_MAX = 48
export const LABEL_FONT_SIZE_PX_DEFAULT = 12

export const clampLabelFontSizePx = (value: number): number =>
  Math.round(clamp(value, LABEL_FONT_SIZE_PX_MIN, LABEL_FONT_SIZE_PX_MAX))

export const normalizeLabelFontSizePx = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? clampLabelFontSizePx(value)
    : undefined

export const isValidLabelFontSizePx = (value: number | undefined): boolean =>
  value === undefined ||
  (Number.isFinite(value) &&
    value >= LABEL_FONT_SIZE_PX_MIN &&
    value <= LABEL_FONT_SIZE_PX_MAX)

// resolved fallback px values when only the legacy `sizeScale` is present —
// tuned to feel like a real S/M/L spread without changing existing renders
// dramatically
export const LABEL_SIZE_SCALE_PX: Record<LabelSizeScale, number> = {
  sm: 9,
  md: 12,
  lg: 16,
}

// per-board label defaults — absent fields fall back to global/built-in
// defaults. `show` overrides AppSettings.showLabels at the board level.
// `textStyleId` overrides the board font for label captions only
export interface BoardLabelSettings
{
  show?: boolean
  placement?: LabelPlacement
  scrim?: LabelScrim
  // legacy preset; new writes prefer fontSizePx
  sizeScale?: LabelSizeScale
  // exact caption size in CSS px; wins over sizeScale when set
  fontSizePx?: number
  textStyleId?: TextStyleId
  // overlay-only text color override; absent or 'auto' -> scrim default
  textColor?: LabelTextColor
}

// per-tile label override layered over board/global defaults. `visible`
// undefined -> inherit; explicit boolean wins regardless of board settings
export interface ItemLabelOptions
{
  visible?: boolean
  placement?: LabelPlacement
  scrim?: LabelScrim
  sizeScale?: LabelSizeScale
  fontSizePx?: number
  textStyleId?: TextStyleId
  textColor?: LabelTextColor
}

export const labelPlacementsEqual = (
  a: LabelPlacement | undefined,
  b: LabelPlacement | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  if (a.mode !== b.mode) return false
  if (a.mode === 'overlay' && b.mode === 'overlay')
  {
    return a.x === b.x && a.y === b.y
  }
  return true
}

export const boardLabelSettingsEqual = (
  a: BoardLabelSettings | undefined,
  b: BoardLabelSettings | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (
    a.show === b.show &&
    labelPlacementsEqual(a.placement, b.placement) &&
    a.scrim === b.scrim &&
    a.sizeScale === b.sizeScale &&
    a.fontSizePx === b.fontSizePx &&
    a.textStyleId === b.textStyleId &&
    a.textColor === b.textColor
  )
}

export const itemLabelOptionsEqual = (
  a: ItemLabelOptions | undefined,
  b: ItemLabelOptions | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (
    a.visible === b.visible &&
    labelPlacementsEqual(a.placement, b.placement) &&
    a.scrim === b.scrim &&
    a.sizeScale === b.sizeScale &&
    a.fontSizePx === b.fontSizePx &&
    a.textStyleId === b.textStyleId &&
    a.textColor === b.textColor
  )
}

export const isEmptyBoardLabelSettings = (
  settings: BoardLabelSettings | undefined
): boolean =>
  !settings ||
  (settings.show === undefined &&
    settings.placement === undefined &&
    settings.scrim === undefined &&
    settings.sizeScale === undefined &&
    settings.fontSizePx === undefined &&
    settings.textStyleId === undefined &&
    settings.textColor === undefined)

export const isEmptyItemLabelOptions = (
  options: ItemLabelOptions | undefined
): boolean =>
  !options ||
  (options.visible === undefined &&
    options.placement === undefined &&
    options.scrim === undefined &&
    options.sizeScale === undefined &&
    options.fontSizePx === undefined &&
    options.textStyleId === undefined &&
    options.textColor === undefined)

// content-addressable image pointer for bytes stored outside the snapshot
export interface TierItemImageRef
{
  hash: string
  cloudMediaExternalId?: string
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
  // per-tile label rendering override; absent -> inherit from board/global
  labelOptions?: ItemLabelOptions
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
  // per-board palette override; absent -> falls through to AppSettings.paletteId
  paletteId?: PaletteId
  // per-board text style override; absent -> falls through to AppSettings.textStyleId
  textStyleId?: TextStyleId
  // per-board page background color override; absent -> falls through to
  // AppSettings.boardBackgroundOverride, then theme default
  pageBackground?: string
  // per-board label rendering defaults; absent fields fall through to global
  labels?: BoardLabelSettings
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
  labelOptions?: ItemLabelOptions
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
  paletteId?: PaletteId
  textStyleId?: TextStyleId
  pageBackground?: string
  labels?: BoardLabelSettings
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

// derived completion status surfaced on the My Lists library page. these are
// computed server-side from counts + indexed live-template lookup; the user
// never sets these directly
export const LIBRARY_BOARD_STATUSES = [
  'draft',
  'in_progress',
  'finished',
  'published',
] as const
export type LibraryBoardStatus = (typeof LIBRARY_BOARD_STATUSES)[number]

// share-state — 'public' iff a live public template sourced from this board
// exists; unlisted templates fold into 'private' here (not-discoverable)
export const LIBRARY_BOARD_VISIBILITIES = ['private', 'public'] as const
export type LibraryBoardVisibility = (typeof LIBRARY_BOARD_VISIBILITIES)[number]

// status filter chip values on the My Lists page. 'all' is a UI-only filter
// state that doesn't appear on individual rows
export const LIBRARY_BOARD_FILTERS = ['all', ...LIBRARY_BOARD_STATUSES] as const
export type LibraryBoardFilter = (typeof LIBRARY_BOARD_FILTERS)[number]

// sort options on the My Lists page — 'updated' is the default; 'progress'
// orders by ranked / activeItemCount w/ a draft-aware tiebreak
export const LIBRARY_BOARD_SORTS = [
  'updated',
  'created',
  'title',
  'progress',
] as const
export type LibraryBoardSort = (typeof LIBRARY_BOARD_SORTS)[number]

// view layout on the My Lists page — grid of cards or a dense table. board
// (kanban) view is intentionally omitted; the columns map 1:1 to the status
// filter & added complexity without a clear UX win on a single-user surface
export const LIBRARY_BOARD_VIEWS = ['grid', 'list'] as const
export type LibraryBoardView = (typeof LIBRARY_BOARD_VIEWS)[number]

// grid card density. 'dense' = more columns, smaller covers; 'loose' = fewer
// columns, larger hero-style covers; 'default' is the middle ground
export const LIBRARY_BOARD_DENSITIES = ['dense', 'default', 'loose'] as const
export type LibraryBoardDensity = (typeof LIBRARY_BOARD_DENSITIES)[number]

// max cover-item labels per row — covers the densest 6x4 grid (24) w/ headroom
export const LIBRARY_BOARD_COVER_ITEM_LIMIT = 18

// max tier colorSpecs per row — matches the canonical 5-tier preset cap
export const LIBRARY_BOARD_TIER_LIMIT = 5

// single cover-item entry. label is null when the item has no caption;
// mediaUrl is null when the item has no image bound (drafts, missing media)
// — the renderer falls back to label or an externalId-derived code
export interface LibraryBoardCoverItem
{
  label: string | null
  externalId: string
  mediaUrl: string | null
}

// per-tier breakdown entry. tierIndex is the row's position (0 = top tier);
// colorSpec resolves against the response's `paletteId` field
export interface LibraryBoardTierBreakdown
{
  tierIndex: number
  itemCount: number
  colorSpec: import('../lib/theme').TierColorSpec
}

// enriched board list row served by getMyLibraryBoards — adds counts, derived
// status/visibility, source-template category, & cover-item labels
export interface LibraryBoardListItem extends BoardListItem
{
  activeItemCount: number
  unrankedItemCount: number
  rankedItemCount: number
  status: LibraryBoardStatus
  visibility: LibraryBoardVisibility
  category: import('../marketplace/template').TemplateCategory
  coverItems: LibraryBoardCoverItem[]
  paletteId: import('../lib/theme').PaletteId
  tierColors: import('../lib/theme').TierColorSpec[]
  tierBreakdown: LibraryBoardTierBreakdown[]
  // forward-compat slot for a "pin to top" feature; always false today
  pinned: boolean
}

export const deriveLibraryBoardStatus = (params: {
  activeItemCount: number
  unrankedItemCount: number
  hasPublishedTemplate: boolean
}): LibraryBoardStatus =>
{
  if (params.hasPublishedTemplate) return 'published'
  if (params.activeItemCount === 0) return 'draft'
  if (params.unrankedItemCount > 0) return 'in_progress'
  return 'finished'
}

// progress as a ratio in [0, 1] — drafts (0 active items) report 0 so sort
// comparisons stay sensible; otherwise it's ranked / active
export const computeLibraryBoardProgress = (
  row: Pick<LibraryBoardListItem, 'activeItemCount' | 'rankedItemCount'>
): number =>
{
  if (row.activeItemCount <= 0) return 0
  const ratio = row.rankedItemCount / row.activeItemCount
  if (!Number.isFinite(ratio)) return 0
  return Math.max(0, Math.min(1, ratio))
}
