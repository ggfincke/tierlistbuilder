// packages/contracts/workspace/board.ts
// serializable board contract — persisted per board & exchanged across import/export

import type { BoardId, ItemId, TierId } from '../lib/ids'
import type { TemplateCoverFraming, TemplateMediaRef } from '../lib/coverMedia'
import type { PaletteId, TextStyleId, TierColorSpec } from '../lib/theme'
import { clamp } from '../lib/math'
import { isFiniteNumber } from '../lib/typeGuards'
import { normalizeStringInput } from '../lib/strings'

// default board title used across local & cloud-backed board creation
export const DEFAULT_BOARD_TITLE = 'My Tier List'

// hard cap for user-supplied board titles
export const MAX_BOARD_TITLE_LENGTH = 200

// tier text caps shared by local import, cloud sync, tier presets, &
// marketplace template normalization
export const MAX_TIER_NAME_LEN = 100
export const MAX_TIER_DESCRIPTION_LEN = 500

// item text caps shared by local import & cloud sync. Convex also caps total
// document size, but these field-level limits keep malformed local JSON from
// persisting megabyte strings into browser storage first
export const MAX_BOARD_ITEM_LABEL_LEN = 200
const MAX_BOARD_ITEM_ALT_TEXT_LEN = 500
const MAX_BOARD_ITEM_NOTES_LEN = 2000
const MAX_BOARD_ITEM_BACKGROUND_COLOR_LEN = 32

export const BOARD_ITEM_TEXT_FIELD_LIMITS = [
  { field: 'label', maxLength: MAX_BOARD_ITEM_LABEL_LEN },
  { field: 'altText', maxLength: MAX_BOARD_ITEM_ALT_TEXT_LEN },
  { field: 'notes', maxLength: MAX_BOARD_ITEM_NOTES_LEN },
  {
    field: 'backgroundColor',
    maxLength: MAX_BOARD_ITEM_BACKGROUND_COLOR_LEN,
  },
] as const

// soft-delete retention window before the daily hard-delete cron purges a board.
// exposed in contracts (not just Convex-internal) so the "Recently deleted" UI
// can compute the permanent-deletion date w/o a server round trip
export const BOARD_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// trim board titles & fall back to the shared default
export const normalizeBoardTitle = (raw: string): string =>
{
  const normalized = normalizeStringInput(raw, MAX_BOARD_TITLE_LENGTH)
  if (!normalized)
  {
    return DEFAULT_BOARD_TITLE
  }

  return normalized
}

// how an image fills its slot when aspect ratios differ; also the canonical
// value type used in per-item overrides & the board-wide default
export type ImageFit = 'cover' | 'contain'

// uniform inset (fraction of each cell edge) that floats a plated logo off the
// frame so it doesn't kiss the edge; the plate fills the margin. a render-time
// frame inset, so (unlike auto-crop's bbox padding) not clamped to the source
export const IMAGE_PADDING_MIN = 0
export const IMAGE_PADDING_MAX = 0.4

// breathing room applied to a plated item when neither item nor board pins a
// value — gives imported logos margin on their plate out of the box. an
// unplated item (no backdrop) resolves to 0 so photos stay full-bleed.
export const DEFAULT_ITEM_IMAGE_PADDING = 0.06

export const clampImagePadding = (value: number): number =>
  clamp(value, IMAGE_PADDING_MIN, IMAGE_PADDING_MAX)

// validate untrusted padding input; non-finite/wrong-type -> undefined so a
// no-override item roundtrips without a phantom value
export const normalizeImagePadding = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? clampImagePadding(value) : undefined

// transparent logos that would be low-contrast on a solid backdrop get a plate
// so they stay readable anywhere: 'light' rescues a dark logo, 'dark' a white
// one; absent -> no plate. resolved to a theme/user color via --t-media-plate-*
export const MEDIA_PLATES = ['light', 'dark'] as const
export type MediaPlate = (typeof MEDIA_PLATES)[number]

// origin of a board item's current image. 'linked' follows the active board
// image style & re-points on a skin switch; 'pinned' is user-owned (imported
// or manually recropped) & is never touched by a switch. absent -> 'linked'
export const ITEM_IMAGE_SOURCES = ['linked', 'pinned'] as const
export type ItemImageSource = (typeof ITEM_IMAGE_SOURCES)[number]

// per-board backdrop behind transparent logos. 'off' plates nothing; 'auto'
// plates only low-contrast logos (per-item MediaPlate) w/ a theme shade;
// 'uniform' fills uniformColor behind every image
export const AUTO_PLATE_MODES = ['off', 'auto', 'uniform'] as const
export type AutoPlateMode = (typeof AUTO_PLATE_MODES)[number]

// fallback mode when a board has no stored autoPlate — readable out of the box.
// a per-item backgroundColor always overrides whatever a mode resolves to
export const AUTO_PLATE_MODE_DEFAULT: AutoPlateMode = 'auto'

// fallback fill for 'uniform' mode when uniformColor is unset (off-white tiles)
export const AUTO_PLATE_UNIFORM_DEFAULT = '#f5f5f5'

// dark uniform-mode preset paired w/ the light default above
export const AUTO_PLATE_UNIFORM_DARK_DEFAULT = '#0a0a0c'

export type BoardAutoPlateSettings =
  | { mode: 'off' }
  | { mode: 'auto' }
  | {
      mode: 'uniform'
      // hex backdrop for 'uniform' mode; absent falls back to the light default
      uniformColor?: string
    }

export const boardAutoPlateSettingsEqual = (
  a: BoardAutoPlateSettings | null | undefined,
  b: BoardAutoPlateSettings | null | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  if (a.mode !== b.mode) return false
  if (a.mode !== 'uniform' || b.mode !== 'uniform') return true
  return a.uniformColor === b.uniformColor
}

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

export type ItemTransformBoundsViolation =
  | {
      field: 'zoom'
      bound: 'min' | 'max'
      min: number
      max: number
    }
  | {
      field: 'offsetX' | 'offsetY'
      bound: 'range'
      min: number
      max: number
    }

export const getItemTransformBoundsViolation = (
  transform: Pick<ItemTransform, 'zoom' | 'offsetX' | 'offsetY'>
): ItemTransformBoundsViolation | null =>
{
  const { zoomMin, zoomMax, offsetMin, offsetMax } = ITEM_TRANSFORM_LIMITS
  if (!Number.isFinite(transform.zoom) || transform.zoom < zoomMin)
  {
    return { field: 'zoom', bound: 'min', min: zoomMin, max: zoomMax }
  }
  if (transform.zoom > zoomMax)
  {
    return { field: 'zoom', bound: 'max', min: zoomMin, max: zoomMax }
  }
  if (
    !Number.isFinite(transform.offsetX) ||
    transform.offsetX < offsetMin ||
    transform.offsetX > offsetMax
  )
  {
    return { field: 'offsetX', bound: 'range', min: offsetMin, max: offsetMax }
  }
  if (
    !Number.isFinite(transform.offsetY) ||
    transform.offsetY < offsetMin ||
    transform.offsetY > offsetMax
  )
  {
    return { field: 'offsetY', bound: 'range', min: offsetMin, max: offsetMax }
  }
  return null
}

export const isItemTransformInRange = (
  transform: Pick<ItemTransform, 'zoom' | 'offsetX' | 'offsetY'>
): boolean => getItemTransformBoundsViolation(transform) === null

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
  isFiniteNumber(value) ? clampLabelFontSizePx(value) : undefined

export const isValidLabelFontSizePx = (value: number | undefined): boolean =>
  value === undefined ||
  (isFiniteNumber(value) &&
    value >= LABEL_FONT_SIZE_PX_MIN &&
    value <= LABEL_FONT_SIZE_PX_MAX)

// per-board label defaults — absent fields fall back to global/built-in
// defaults. `show` overrides AppPreferences.showLabels at the board level.
// `textStyleId` overrides the board font for label captions only
interface LabelSharedOptions
{
  placement?: LabelPlacement
  scrim?: LabelScrim
  fontSizePx?: number
  textStyleId?: TextStyleId
  // overlay-only text color override; absent or 'auto' -> scrim default
  textColor?: LabelTextColor
}

export interface BoardLabelSettings extends LabelSharedOptions
{
  show?: boolean
}

// per-tile label override layered over board/global defaults. `visible`
// undefined -> inherit; explicit boolean wins regardless of board settings
export interface ItemLabelOptions extends LabelSharedOptions
{
  visible?: boolean
}

const labelPlacementsEqual = (
  a: LabelPlacement | undefined,
  b: LabelPlacement | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  if (a.mode !== b.mode) return false
  if (a.mode === 'overlay' && b.mode === 'overlay')
  {
    return a.x === b.x && a.y === b.y
  }
  return true
}

const labelSharedOptionsEqual = (
  a: LabelSharedOptions,
  b: LabelSharedOptions
): boolean =>
  labelPlacementsEqual(a.placement, b.placement) &&
  a.scrim === b.scrim &&
  a.fontSizePx === b.fontSizePx &&
  a.textStyleId === b.textStyleId &&
  a.textColor === b.textColor

const isEmptyLabelSharedOptions = (options: LabelSharedOptions): boolean =>
  options.placement === undefined &&
  options.scrim === undefined &&
  options.fontSizePx === undefined &&
  options.textStyleId === undefined &&
  options.textColor === undefined

export const boardLabelSettingsEqual = (
  a: BoardLabelSettings | null | undefined,
  b: BoardLabelSettings | null | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  return a.show === b.show && labelSharedOptionsEqual(a, b)
}

export const itemLabelOptionsEqual = (
  a: ItemLabelOptions | undefined,
  b: ItemLabelOptions | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  return a.visible === b.visible && labelSharedOptionsEqual(a, b)
}

export const isEmptyBoardLabelSettings = (
  settings: BoardLabelSettings | undefined
): boolean =>
  !settings ||
  (settings.show === undefined && isEmptyLabelSharedOptions(settings))

export const isEmptyItemLabelOptions = (
  options: ItemLabelOptions | undefined
): boolean =>
  !options ||
  (options.visible === undefined && isEmptyLabelSharedOptions(options))

// board-level settings that drive how an item's media renders on read-only
// viewing surfaces (consensus tiers/rail/compare): label chrome + backdrop
// plate. Bundled so surfaces thread one prop, not N parallel board settings.
export interface BoardItemDisplaySettings
{
  // label chrome (visibility, placement, font); null inherits global defaults
  labels: BoardLabelSettings | null
  // backdrop plate behind transparent media; null -> On+Auto default in
  // resolveItemBackdrop
  autoPlate: BoardAutoPlateSettings | null
  // board-wide plate inset; null -> plate-aware fallback
  defaultItemImagePadding: number | null
}

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

// identity of a board's live ranking shown as a tile in the profile showcase
// (tlotl). primitives only — the cover/mini render payload resolves separately
// & reaches ItemContent via ShowcaseRenderContext keyed by boardExternalId
export interface ShowcaseItemRef
{
  boardExternalId: string
  rankingSlug: string
  title: string
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
  // per-item uniform plate inset (fraction of cell edge); absent -> board
  // default, then the plate-aware fallback. see DEFAULT_ITEM_IMAGE_PADDING
  imagePadding?: number
  // per-tile label rendering override; absent -> inherit from board/global
  labelOptions?: ItemLabelOptions
  // marketplace template item external id captured when a board is forked
  // locally. first cloud sync resolves it to boardItems.templateItemId so the
  // board can publish rankings against its source template.
  sourceTemplateItemExternalId?: string
  // whether this item's image follows the active board image style ('linked')
  // or is user-owned ('pinned'); absent -> 'linked'. see ItemImageSource
  imageSource?: ItemImageSource
  // set only on profile-showcase items — marks this tile as a published-ranking
  // lane. absent on every normal board item. see ShowcaseItemRef
  showcaseRanking?: ShowcaseItemRef
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

interface BoardSnapshotBase
{
  title: string
  tiers: Tier[]
  unrankedItemIds: ItemId[]
  // slot aspect ratio (w/h); absent -> 1 (square)
  itemAspectRatio?: number
  // 'auto' tracks content, 'manual' pins to itemAspectRatio; absent -> 'auto'
  itemAspectRatioMode?: ItemAspectRatioMode
  // suppresses the mixed-ratio modal on this board; absent -> not suppressed
  aspectRatioPromptDismissed?: boolean
  // board-wide fit when item has no override; absent -> 'cover'
  defaultItemImageFit?: ImageFit
  // board-wide plate inset when item has no override; absent -> the plate-aware
  // fallback (DEFAULT_ITEM_IMAGE_PADDING for plated items, else 0)
  defaultItemImagePadding?: number
  // per-board palette override; absent -> falls through to AppPreferences.paletteId
  paletteId?: PaletteId
  // per-board text style override; absent -> falls through to AppPreferences.textStyleId
  textStyleId?: TextStyleId
  // per-board page background color override; absent -> falls through to
  // AppPreferences.boardBackgroundOverride, then theme default
  pageBackground?: string
  // per-board label rendering defaults; absent fields fall through to global
  labels?: BoardLabelSettings
  // per-board logo backdrop; absent -> On+Auto default
  autoPlate?: BoardAutoPlateSettings
  // source-template/ranking identity captured at fork/remix time. travels w/
  // cloud sync & JSON export so a re-imported board still knows where it came
  // from. titles denormalize so the breadcrumb survives source deletion
  sourceTemplateId?: string
  sourceRankingId?: string
  sourceTemplateTitle?: string
  sourceRankingTitle?: string
  // local-only source template cover metadata for pre-sync fork cards. cloud
  // library rows rehydrate this from the source template instead.
  sourceTemplateCoverMedia?: TemplateMediaRef
  sourceTemplateCoverFraming?: TemplateCoverFraming | null
  // criterion/lane the user started from when forking a template or remixing a
  // ranking. the server validates it against the source template on first sync.
  preferredCriterionExternalId?: string
  // active board image style (skin) externalId; absent -> source template
  // default style. drives which per-item images the board renders
  imageStyleId?: string
}

// full serializable board snapshot — persisted per board & exchanged across import/export
export interface BoardSnapshot extends BoardSnapshotBase
{
  items: Record<ItemId, TierItem>
  deletedItems: TierItem[]
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
  imagePadding?: number
  labelOptions?: ItemLabelOptions
  sourceTemplateItemExternalId?: string
}

// wire-format variant of `BoardSnapshot` — same shape as in-memory but
// items carry inline base64 image bytes instead of IndexedDB references
export interface BoardSnapshotWire extends BoardSnapshotBase
{
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
