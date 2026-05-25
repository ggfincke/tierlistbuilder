// packages/contracts/platform/showcase.ts
// tlotl (tier list of tier lists) profile showcase contracts

import type { TierColorSpec } from '../lib/theme'
import type {
  MarketplaceItemRenderFields,
  TemplateMediaRef,
} from '../marketplace/template'

// tile rendering modes — 'cover' shows each ranking's source-template cover;
// 'mini' shows a tiny live tier-list of the ranking itself (the meta view)
export const SHOWCASE_TILE_MODES = ['cover', 'mini'] as const
export type ShowcaseTileMode = (typeof SHOWCASE_TILE_MODES)[number]

export const SHOWCASE_TILE_MODE_DEFAULT: ShowcaseTileMode = 'cover'

// caps — keep the showcase legible & the public read query bounded
export const MAX_SHOWCASE_TIERS = 8
export const MAX_SHOWCASE_PLACED_ITEMS = 60
// items rendered inside a single 'mini' tile before truncation
export const SHOWCASE_MINI_ITEM_LIMIT = 16

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

// one tier row inside a 'mini' tile — colors + the ranking's placed items
export interface ShowcaseMiniTier
{
  colorSpec: TierColorSpec
  rowColorSpec: TierColorSpec | null
  items: MarketplaceItemRenderFields[]
}

// compact tier-list render of a ranking, for the 'mini' tile
export interface ShowcaseMiniSnapshot
{
  tiers: ShowcaseMiniTier[]
  // slot aspect ratio (w/h) the ranking was designed against; null -> square
  itemAspectRatio: number | null
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
