// packages/contracts/workspace/libraryBoard.ts
// my lists library read-model contracts

import { clamp } from '../lib/math'
import type { PaletteId, TierColorSpec } from '../lib/theme'
import type { TemplateCategory } from '../marketplace/category'
import type {
  TemplateCoverFraming,
  TemplateMediaRef,
  TemplateSizeClass,
} from '../marketplace/template'
import type { MediaVariantKind } from '../platform/media'
import type { ShowcaseMiniSnapshot } from '../social/showcase'
import type {
  BoardAutoPlateSettings,
  BoardListItem,
  ImageFit,
  ItemTransform,
  MediaPlate,
} from './board'

// content-derived publish state: Draft = no placed items, WIP = placed items,
// live = public output exists
// never user-toggled; see deriveLibraryPublishState
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

// share-state: 'public' iff a live public template/ranking sourced from
// this board exists; unlisted output folds into 'private' here
export const LIBRARY_BOARD_VISIBILITIES = ['private', 'public'] as const
export type LibraryBoardVisibility = (typeof LIBRARY_BOARD_VISIBILITIES)[number]

// cloud-state of a board row: 'localOnly' lives only in the browser;
// 'cloudBacked' has a Convex row; 'syncPausedForPlan' is over the user's
// plan cap & writes are deferred until they upgrade or free a slot
export const BOARD_CLOUD_STATES = [
  'localOnly',
  'cloudBacked',
  'syncPausedForPlan',
] as const
export type BoardCloudState = (typeof BOARD_CLOUD_STATES)[number]

// async clone-from-template lifecycle: 'ready' is the steady state;
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

// sort options on the My Lists page: 'updated' is the default; 'progress'
// orders by ranked / activeItemCount w/ a draft-aware tiebreak
export const LIBRARY_BOARD_SORTS = [
  'updated',
  'created',
  'title',
  'progress',
] as const
export type LibraryBoardSort = (typeof LIBRARY_BOARD_SORTS)[number]

// view layout on the My Lists page: grid cards or dense table.
// board view is omitted; columns map 1:1 to the status filter
export const LIBRARY_BOARD_VIEWS = ['grid', 'list'] as const
export type LibraryBoardView = (typeof LIBRARY_BOARD_VIEWS)[number]

// grid card density. 'dense' = more columns, smaller covers; 'loose' = fewer
// columns, larger hero-style covers; 'default' is the middle ground
export const LIBRARY_BOARD_DENSITIES = ['dense', 'default', 'loose'] as const
export type LibraryBoardDensity = (typeof LIBRARY_BOARD_DENSITIES)[number]

// max cover-item labels per row; covers the densest 6x4 grid w/ headroom
export const LIBRARY_BOARD_COVER_ITEM_LIMIT = 18

// max tier colorSpecs per row; matches the canonical 5-tier preset cap
export const LIBRARY_BOARD_TIER_LIMIT = 5

// per-item render settings copied onto cover items so a board's mosaic renders
// each tile the way the board itself does (plate / fit / crop) instead of a
// blind cover-crop. all optional; absent fields fall back to a plain cover
export interface LibraryBoardCoverRenderFields
{
  imageFit?: ImageFit
  imagePadding?: number
  backgroundColor?: string
  mediaPlate?: MediaPlate
  transform?: ItemTransform
  aspectRatio?: number
}

export const COVER_RENDER_FIELD_KEYS = [
  'imageFit',
  'imagePadding',
  'backgroundColor',
  'mediaPlate',
  'transform',
  'aspectRatio',
] as const satisfies readonly (keyof LibraryBoardCoverRenderFields)[]

export type CoverRenderFieldSource = {
  imageFit?: ImageFit | null
  imagePadding?: number | null
  backgroundColor?: string | null
  mediaPlate?: MediaPlate | null
  transform?: ItemTransform | null
  aspectRatio?: number | null
}

export type NullableCoverRenderFields = {
  [K in keyof LibraryBoardCoverRenderFields]-?:
    | LibraryBoardCoverRenderFields[K]
    | null
}

export const pickNullableCoverRenderFields = (
  item: CoverRenderFieldSource
): NullableCoverRenderFields => ({
  imageFit: item.imageFit ?? null,
  imagePadding: item.imagePadding ?? null,
  backgroundColor: item.backgroundColor ?? null,
  mediaPlate: item.mediaPlate ?? null,
  transform: item.transform ?? null,
  aspectRatio: item.aspectRatio ?? null,
})

// copy the per-item render fields off any item-like source onto a cover/summary
// item, normalizing null -> undefined so every summary & projection builder
// mirrors them identically (one place to add a field, no per-builder drift)
export const pickCoverRenderFields = (
  item: CoverRenderFieldSource
): LibraryBoardCoverRenderFields => ({
  imageFit: item.imageFit ?? undefined,
  imagePadding: item.imagePadding ?? undefined,
  backgroundColor: item.backgroundColor ?? undefined,
  mediaPlate: item.mediaPlate ?? undefined,
  transform: item.transform ?? undefined,
  aspectRatio: item.aspectRatio ?? undefined,
})

// single cover-item entry. label is null when the item has no caption;
// mediaUrl is null when the item has no image bound (drafts, missing media)
// renderer falls back to label or an externalId-derived code
export interface LibraryBoardCoverItem extends LibraryBoardCoverRenderFields
{
  label: string | null
  externalId: string
  mediaUrl: string | null
  // local rows can carry hash-backed media instead of a ready storage URL.
  // Cover tiles resolve this through the same lazy image cache used by boards.
  mediaHash?: string
  mediaCloudExternalId?: string
  mediaVariant?: MediaVariantKind
}

// per-tier breakdown entry. tierIndex is the row's position (0 = top tier);
// colorSpec resolves against the response's `paletteId` field
export interface LibraryBoardTierBreakdown
{
  tierIndex: number
  itemCount: number
  colorSpec: TierColorSpec
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
  category: TemplateCategory
  sourceTemplateSizeClass: TemplateSizeClass | null
  sourceTemplateCoverMedia: TemplateMediaRef | null
  sourceTemplateCoverFraming: TemplateCoverFraming | null
  coverItems: LibraryBoardCoverItem[]
  // board-level render context for the cover mosaic; mirrors the board's own
  // item-render settings so tiles resolve plates / fit the way the board does
  autoPlate?: BoardAutoPlateSettings | null
  defaultItemImageFit?: ImageFit | null
  defaultItemImagePadding?: number | null
  itemAspectRatio?: number | null
  paletteId: PaletteId
  // total tier count; tierColors/tierBreakdown are capped at
  // LIBRARY_BOARD_TIER_LIMIT, so this is the source of truth for the count
  tierCount: number
  tierColors: TierColorSpec[]
  tierBreakdown: LibraryBoardTierBreakdown[]
  // live mini tier-list render for the cover; non-null only on boards w/ a
  // reachable live public ranking; drafts/WIP fall back to the mosaic cover
  mini: ShowcaseMiniSnapshot | null
  // forward-compat slot for a "pin to top" feature; always false today
  pinned: boolean
}

export const deriveLibraryPublishState = (params: {
  rankedItemCount: number
  hasPublishedOutput: boolean
}): PublishState =>
{
  if (params.hasPublishedOutput) return 'live'
  return params.rankedItemCount > 0 ? 'wip' : 'draft'
}

// server-knowable sync state: maps the clone-from-template lifecycle onto the
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

// progress ratio in [0, 1]; drafts report 0 so sort
// comparisons stay sensible; otherwise it's ranked / active
export const computeLibraryBoardProgress = (
  row: Pick<LibraryBoardListItem, 'activeItemCount' | 'rankedItemCount'>
): number =>
{
  if (row.activeItemCount <= 0) return 0
  const ratio = row.rankedItemCount / row.activeItemCount
  if (!Number.isFinite(ratio)) return 0
  return clamp(ratio, 0, 1)
}
