// packages/contracts/platform/showcase.ts
// tlotl (tier list of tier lists) profile showcase contracts

import type { TierColorSpec } from '../lib/theme'
import type { BoardAutoPlateSettings } from '../workspace/board'
import type {
  MarketplaceItemRenderFields,
  TemplateMediaRef,
} from '../marketplace/template'

// tile rendering modes for a ranking on the profile showcase. cover = source
// template cover; the rest derive from the ranking's own tiers/items (see
// ShowcaseTileContent). topRow/cropped/summary/winners are profile-card variants
export const SHOWCASE_TILE_MODES = [
  'cover',
  'mini',
  'topRow',
  'cropped',
  'summary',
  'winners',
] as const
export type ShowcaseTileMode = (typeof SHOWCASE_TILE_MODES)[number]

export const SHOWCASE_TILE_MODE_DEFAULT: ShowcaseTileMode = 'cover'

// short labels for the editor's tile-mode tabs
export const SHOWCASE_TILE_MODE_LABELS: Record<ShowcaseTileMode, string> = {
  cover: 'Cover',
  mini: 'Full',
  topRow: 'Top row',
  cropped: 'Cropped',
  summary: 'Summary',
  winners: 'Winners',
}

// caps — keep the showcase legible & the public read query bounded
export const MAX_SHOWCASE_TIERS = 8
export const MAX_SHOWCASE_PLACED_ITEMS = 60
// mini tile caps: show the top few tiers, each filled to a full row. media reads
// per tile stay bounded by SHOWCASE_MINI_TIER_LIMIT * SHOWCASE_MINI_ITEMS_PER_TIER
export const SHOWCASE_MINI_TIER_LIMIT = 4
export const SHOWCASE_MINI_ITEMS_PER_TIER = 9
// label cap per tier — labels-only (no media reads); bounds the payload while
// keeping enough text for topRow/summary cards even when the leading items in
// a tier are unlabeled logos that pushed labeled picks past the items[] slice
export const SHOWCASE_MINI_LABELS_PER_TIER = 24

// stable key for a ranking lane (template + criterion) — used for dedup &
// laneKey -> render-payload lookup in ShowcaseRenderContext
export const showcaseLaneKey = (
  templateId: string,
  criterionExternalId: string
): string => `${templateId}:${criterionExternalId}`

// a tier row in the showcase — mirrors the board tier shape so the workspace
// editor's tier data maps in & out w/o translation
export interface ShowcaseTier
{
  externalId: string
  name: string
  description: string | null
  colorSpec: TierColorSpec
  rowColorSpec: TierColorSpec | null
  order: number
}

// starter tiers for a brand-new showcase (classic S-E), mirrors BUILTIN_PRESETS
const SHOWCASE_TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E'] as const

export const DEFAULT_SHOWCASE_TIERS: ShowcaseTier[] = SHOWCASE_TIER_NAMES.map(
  (name, index) => ({
    externalId: `tier-${name.toLowerCase()}`,
    name,
    description: null,
    colorSpec: { kind: 'palette', index },
    rowColorSpec: null,
    order: index,
  })
)

// one tier row inside a mini snapshot — name, colors, & the ranking's items
export interface ShowcaseMiniTier
{
  name: string
  colorSpec: TierColorSpec
  rowColorSpec: TierColorSpec | null
  // total items in this tier; items[] below is truncated for the render
  itemCount: number
  items: MarketplaceItemRenderFields[]
  // labels of labeled items in the tier (no media), capped to
  // SHOWCASE_MINI_LABELS_PER_TIER — independent of items[]'s media-bounded
  // truncation so topRow/summary cards still see labels past the 9-item slice
  labels: string[]
}

// compact projection of a ranking driving every non-cover tile mode
export interface ShowcaseMiniSnapshot
{
  tiers: ShowcaseMiniTier[]
  // slot aspect ratio (w/h) the ranking was designed against; null -> square
  itemAspectRatio: number | null
  // the ranking's plate policy so logos get the same auto-plate backdrop as the
  // board — else dark logos vanish on the dark mini lane
  autoPlate: BoardAutoPlateSettings | null
  // full-rank labels for Winners mode; tiers[] above is intentionally truncated
  topPickLabel: string | null
  bottomPickLabel: string | null
  // ranking-level facts for the summary card
  rankedCount: number
  updatedAt: number
}

// lane identity + resolved render payload for one ranking tile. cover/mini are
// resolved server-side; the client picks which to draw per the active tileMode
export interface ShowcaseRankingTile
{
  templateId: string
  criterionExternalId: string
  rankingSlug: string
  title: string
  // source-template cover for 'cover' mode; null when the template has none
  cover: TemplateMediaRef | null
  // compact ranking render for 'mini' mode; null when empty or not requested
  mini: ShowcaseMiniSnapshot | null
}

// a tile placed in a specific tier (editor edit-state + public render)
export interface ShowcasePlacedTile extends ShowcaseRankingTile
{
  tierExternalId: string
  order: number
}

// editor query response — full editable state for the owner
export interface ProfileShowcaseEditData
{
  tileMode: ShowcaseTileMode
  tiers: ShowcaseTier[]
  placed: ShowcasePlacedTile[]
  // owner's published lanes not yet placed — the derived unranked pool
  unranked: ShowcaseRankingTile[]
}

// public read-only render — each tier carries its ordered tiles
interface PublicProfileShowcaseTier extends ShowcaseTier
{
  tiles: ShowcaseRankingTile[]
}

export interface PublicProfileShowcase
{
  tileMode: ShowcaseTileMode
  tiers: PublicProfileShowcaseTier[]
  // total placed tiles across all tiers — lets the profile hide an empty
  // showcase for visitors w/o walking every tier
  placedCount: number
}

// one placement in the save payload — references a lane, never a snapshot
export interface ShowcasePlacementInput
{
  tierExternalId: string
  templateId: string
  criterionExternalId: string
  order: number
}

// save mutation input — unranked is never sent (derived server-side)
export interface ProfileShowcaseSaveInput
{
  tileMode: ShowcaseTileMode
  tiers: ShowcaseTier[]
  placements: ShowcasePlacementInput[]
}
