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

// transparent logos that would be low-contrast on a solid backdrop get a plate
// so they stay readable anywhere: 'light' rescues a dark logo, 'dark' a white
// one; absent -> no plate. resolved to a theme/user color via --t-media-plate-*
export const MEDIA_PLATES = ['light', 'dark'] as const
export type MediaPlate = (typeof MEDIA_PLATES)[number]

// 'auto' recomputes the board ratio from majority of item ratios on import;
// 'manual' pins the user-selected value
export type ItemAspectRatioMode = 'auto' | 'manual'

// quarter-turn rotation in degrees applied to the rendered image content.
// free rotation is out of scope so the export rasterizer doesn't have to
// handle sub-pixel anti-aliasing on rotated edges
export type ItemRotation = 0 | 90 | 180 | 270

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

// caption placement modes — overlay sits inside the image frame;
// captionAbove/captionBelow render a full-width strip outside the image
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

interface LabelCaptionAbovePlacement
{
  mode: 'captionAbove'
}

interface LabelCaptionBelowPlacement
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

// frozen module-level placements so callers of placementFromMode return a
// stable reference per mode — preserves downstream useMemo identity & avoids
// per-item per-render allocations in the resolver hot path
const PLACEMENT_CAPTION_ABOVE: LabelPlacement = { mode: 'captionAbove' }
const PLACEMENT_CAPTION_BELOW: LabelPlacement = { mode: 'captionBelow' }

const PLACEMENT_BY_MODE: Record<LabelPlacementMode, LabelPlacement> = {
  overlay: LABEL_PLACEMENT_DEFAULT,
  captionAbove: PLACEMENT_CAPTION_ABOVE,
  captionBelow: PLACEMENT_CAPTION_BELOW,
}

// inflate a mode discriminant to a concrete LabelPlacement; overlay uses
// the canonical bottom-center anchor since modes carry no x/y
export const placementFromMode = (mode: LabelPlacementMode): LabelPlacement =>
  PLACEMENT_BY_MODE[mode]

// global label defaults bundled together — fields always travel as a pair
// through the resolver & per-board apply-to-all plans. fontSizePx is the
// final fallback when neither item nor board sets one
export interface GlobalLabelDefaults
{
  showLabels: boolean
  placementMode: LabelPlacementMode
  fontSizePx: number
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

// caption font-size in CSS px. clamped at the contract level so wire payloads
// can't request absurd values; the editor UI exposes this as a numeric input
export const LABEL_FONT_SIZE_PX_MIN = 8
export const LABEL_FONT_SIZE_PX_MAX = 48
export const LABEL_FONT_SIZE_PX_DEFAULT = 12

const clampLabelFontSizePx = (value: number): number =>
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

// per-board label defaults — absent fields fall back to global/built-in
// defaults. `show` overrides AppPreferences.showLabels at the board level.
// `textStyleId` overrides the board font for label captions only
export interface BoardLabelSettings
{
  show?: boolean
  placement?: LabelPlacement
  scrim?: LabelScrim
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
  fontSizePx?: number
  textStyleId?: TextStyleId
  textColor?: LabelTextColor
}

const labelPlacementsEqual = (
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
  a: BoardLabelSettings | null | undefined,
  b: BoardLabelSettings | null | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (
    a.show === b.show &&
    labelPlacementsEqual(a.placement, b.placement) &&
    a.scrim === b.scrim &&
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
    options.fontSizePx === undefined &&
    options.textStyleId === undefined &&
    options.textColor === undefined)

// origin of the bytes a TierItemImageRef points at. only 'source' today —
// source-owned refs point at marketplace assets & must upload a copy pre-sync.
// authoritative list; never hand-type the literal at a call site
export const CLOUD_MEDIA_OWNERSHIPS = ['source'] as const
export type CloudMediaOwnership = (typeof CLOUD_MEDIA_OWNERSHIPS)[number]

export interface TierItemImageRef
{
  hash: string
  cloudMediaExternalId?: string
  cloudMediaOwnership?: CloudMediaOwnership
}

// single item placed in a tier or the unranked pool. imageRef is the small
// preview thumb; tile refs target board rendering; source refs keep editor bytes
export interface TierItem
{
  id: ItemId
  imageRef?: TierItemImageRef
  tileImageRef?: TierItemImageRef
  sourceImageRef?: TierItemImageRef
  label?: string
  backgroundColor?: string
  // tri-state plate for transparent logos; see MediaPlate
  mediaPlate?: MediaPlate
  altText?: string
  // private per-item editor notes — "why I ranked this here" scratchpad.
  // travels w/ cloud sync & JSON export, but never out to published rankings
  notes?: string
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
  // marketplace template item external id captured when a board is forked
  // locally. first cloud sync resolves it to boardItems.templateItemId so the
  // board can publish rankings against its source template.
  sourceTemplateItemExternalId?: string
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
  // per-board palette override; absent -> falls through to AppPreferences.paletteId
  paletteId?: PaletteId
  // per-board text style override; absent -> falls through to AppPreferences.textStyleId
  textStyleId?: TextStyleId
  // per-board page background color override; absent -> falls through to
  // AppPreferences.boardBackgroundOverride, then theme default
  pageBackground?: string
  // per-board label rendering defaults; absent fields fall through to global
  labels?: BoardLabelSettings
  // source-template/ranking identity captured at fork/remix time. travels w/
  // cloud sync & JSON export so a re-imported board still knows where it came
  // from. titles denormalize so the breadcrumb survives source deletion
  sourceTemplateId?: string
  sourceRankingId?: string
  sourceTemplateTitle?: string
  sourceRankingTitle?: string
  // local-only source template cover metadata for pre-sync fork cards. cloud
  // library rows rehydrate this from the source template instead.
  sourceTemplateCoverMedia?: import('../marketplace/template').TemplateMediaRef
  sourceTemplateCoverFraming?:
    | import('../marketplace/template').TemplateCoverFraming
    | null
  // criterion/lane the user started from when forking a template or remixing a
  // ranking. the server validates it against the source template on first sync.
  preferredCriterionExternalId?: string
}

// payload for adding new items before IDs are assigned. image import writes
// preview, tile, & editor blobs to IndexedDB before passing refs here
export interface NewTierItem
{
  imageRef?: TierItemImageRef
  tileImageRef?: TierItemImageRef
  sourceImageRef?: TierItemImageRef
  label?: string
  backgroundColor?: string
  // natural image aspect ratio captured at import time
  aspectRatio?: number
}

// wire-format TierItem used at JSON import/export & share-link encode boundaries.
// carries a base64 `imageUrl` so exports are self-contained; import persists
// the bytes to IndexedDB before restoring local image refs
export interface TierItemWire
{
  id: ItemId
  imageUrl?: string
  label?: string
  backgroundColor?: string
  mediaPlate?: MediaPlate
  altText?: string
  notes?: string
  aspectRatio?: number
  imageFit?: ImageFit
  transform?: ItemTransform
  labelOptions?: ItemLabelOptions
  sourceTemplateItemExternalId?: string
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
  sourceTemplateId?: string
  sourceRankingId?: string
  sourceTemplateTitle?: string
  sourceRankingTitle?: string
  sourceTemplateCoverMedia?: import('../marketplace/template').TemplateMediaRef
  sourceTemplateCoverFraming?:
    | import('../marketplace/template').TemplateCoverFraming
    | null
  preferredCriterionExternalId?: string
}

// metadata entry for a single board in the multi-board registry
export interface BoardMeta
{
  id: BoardId
  title: string
  createdAt: number
}

// board list row projected for the My Lists library page; also returned by
// the Convex board listing queries for cloud-backed boards
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

// content-derived publish state — Draft (items exist but none placed in a
// tier), WIP (>=1 placed, not published), Live (published as a public
// template/ranking). Never user-toggled; see deriveLibraryPublishState
export const PUBLISH_STATES = ['draft', 'wip', 'live'] as const
export type PublishState = (typeof PUBLISH_STATES)[number]

// cloud sync state surfaced as the board's sync chip. 'localOnly' lives only
// in the browser; 'synced' has a cloud row at rest; 'pending'/'failed' track
// an in-flight or errored clone job; 'conflict' needs a user merge
export const SYNC_STATES = [
  'localOnly',
  'synced',
  'pending',
  'failed',
  'conflict',
] as const
export type SyncState = (typeof SYNC_STATES)[number]

// share-state — 'public' iff a live public template sourced from this board
// exists; unlisted templates fold into 'private' here (not-discoverable)
export const LIBRARY_BOARD_VISIBILITIES = ['private', 'public'] as const
export type LibraryBoardVisibility = (typeof LIBRARY_BOARD_VISIBILITIES)[number]

// cloud-state of a board row — 'localOnly' lives only in the browser;
// 'cloudBacked' has a Convex row; 'syncPausedForPlan' is over the user's
// plan cap & writes are deferred until they upgrade or free a slot
export const BOARD_CLOUD_STATES = [
  'localOnly',
  'cloudBacked',
  'syncPausedForPlan',
] as const
export type BoardCloudState = (typeof BOARD_CLOUD_STATES)[number]

// async clone-from-template lifecycle — 'ready' is the steady state;
// 'clonePending' surfaces the syncing chip; 'cloneFailed' surfaces a retry
export const BOARD_MATERIALIZATION_STATES = [
  'ready',
  'clonePending',
  'cloneFailed',
] as const
export type BoardMaterializationState =
  (typeof BOARD_MATERIALIZATION_STATES)[number]

// reasons a board's cloud sync is paused. only 'planLimit' today, but the
// server is allowed to introduce more without breaking older clients
export const BOARD_PAUSED_REASONS = ['planLimit'] as const
export type BoardPausedReason = (typeof BOARD_PAUSED_REASONS)[number]

// publish-state filter chip values on the My Boards page. 'all' is a UI-only
// filter state that doesn't appear on individual rows
export const LIBRARY_BOARD_FILTERS = ['all', ...PUBLISH_STATES] as const
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
  // local rows can carry hash-backed media instead of a ready storage URL.
  // Cover tiles resolve this through the same lazy image cache used by boards.
  mediaHash?: string
  mediaCloudExternalId?: string
  mediaVariant?: import('../platform/media').MediaVariantKind
}

// per-tier breakdown entry. tierIndex is the row's position (0 = top tier);
// colorSpec resolves against the response's `paletteId` field
export interface LibraryBoardTierBreakdown
{
  tierIndex: number
  itemCount: number
  colorSpec: import('../lib/theme').TierColorSpec
}

// enriched board list row used by the My Lists library UI
export interface LibraryBoardListItem extends BoardListItem
{
  activeItemCount: number
  unrankedItemCount: number
  rankedItemCount: number
  publishState: PublishState
  syncState: SyncState
  visibility: LibraryBoardVisibility
  category: import('../marketplace/category').TemplateCategory
  sourceTemplateSizeClass:
    | import('../marketplace/template').TemplateSizeClass
    | null
  sourceTemplateCoverMedia:
    | import('../marketplace/template').TemplateMediaRef
    | null
  sourceTemplateCoverFraming:
    | import('../marketplace/template').TemplateCoverFraming
    | null
  coverItems: LibraryBoardCoverItem[]
  paletteId: import('../lib/theme').PaletteId
  tierColors: import('../lib/theme').TierColorSpec[]
  tierBreakdown: LibraryBoardTierBreakdown[]
  // forward-compat slot for a "pin to top" feature; always false today
  pinned: boolean
}

export const deriveLibraryPublishState = (params: {
  rankedItemCount: number
  hasPublishedTemplate: boolean
}): PublishState =>
{
  if (params.hasPublishedTemplate) return 'live'
  return params.rankedItemCount > 0 ? 'wip' : 'draft'
}

// server-knowable sync state — maps the clone-from-template lifecycle onto the
// sync chip. 'localOnly' & 'conflict' are client-only: set by the local-board
// projection & the conflict queue respectively
export const deriveLibrarySyncState = (params: {
  materializationState?: BoardMaterializationState
}): SyncState =>
{
  if (params.materializationState === 'clonePending') return 'pending'
  if (params.materializationState === 'cloneFailed') return 'failed'
  return 'synced'
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
