// packages/contracts/platform/showcase.ts
// tlotl (tier list of tier lists) profile showcase contracts

import type { TierColorSpec } from '../lib/theme'
import type { PublicTierRow } from '../lib/publicTier'
import type { BoardAutoPlateSettings } from '../workspace/board'
import { DEFAULT_SE_TIERS } from '../workspace/tierPreset'
import type {
  MarketplaceItemRenderFields,
  TemplateMediaRef,
} from '../marketplace/template'

// caps — keep the showcase legible & the public read query bounded
export const MAX_SHOWCASE_TIERS = 8
export const MAX_SHOWCASE_PLACED_ITEMS = 60
// mini tile caps: show the top few tiers, each filled to a full row. media reads
// per tile stay bounded by SHOWCASE_MINI_TIER_LIMIT * SHOWCASE_MINI_ITEMS_PER_TIER
export const SHOWCASE_MINI_TIER_LIMIT = 4
// library board-card cover shows more tiers than the profile tile (taller surface)
export const LIBRARY_COVER_MINI_TIER_LIMIT = 6
export const SHOWCASE_MINI_ITEMS_PER_TIER = 9

// a tier row in the showcase — mirrors the board tier shape so the workspace
// editor's tier data maps in & out w/o translation
export type ShowcaseTier = PublicTierRow

// starter tiers for a brand-new showcase (classic S-E)
export const DEFAULT_SHOWCASE_TIERS: ShowcaseTier[] = DEFAULT_SE_TIERS.map(
  (tier, index) => ({
    externalId: `tier-${tier.name.toLowerCase()}`,
    name: tier.name,
    description: null,
    colorSpec: tier.colorSpec,
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
  items: MarketplaceItemRenderFields[]
}

// compact projection of a ranking driving the cropped profile tile
export interface ShowcaseMiniSnapshot
{
  tiers: ShowcaseMiniTier[]
  // slot aspect ratio (w/h) the ranking was designed against; null -> square
  itemAspectRatio: number | null
  // the ranking's plate policy so logos get the same auto-plate backdrop as the
  // board — else dark logos vanish on the dark mini lane
  autoPlate: BoardAutoPlateSettings | null
}

// board identity + resolved render payload for one ranking tile. mini drives
// the cropped tile; cover is a fallback when the mini cannot be resolved
export interface ShowcaseRankingTile
{
  // the owner's board this tile came from — the stable per-tile identity
  boardExternalId: string
  rankingSlug: string
  title: string
  // source-template cover for 'cover' mode; null when the template has none
  cover: TemplateMediaRef | null
  // compact cropped render; null when empty or skipped by the read budget
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
  tiers: PublicProfileShowcaseTier[]
  // total placed tiles across all tiers — lets the profile hide an empty
  // showcase for visitors w/o walking every tier
  placedCount: number
}

// one placement in the save payload — references the owner's board, never a
// snapshot. the board resolves to its current live ranking server-side
export interface ShowcasePlacementInput
{
  tierExternalId: string
  boardExternalId: string
  order: number
}

// save mutation input — unranked is never sent (derived server-side)
export interface ProfileShowcaseSaveInput
{
  tiers: ShowcaseTier[]
  placements: ShowcasePlacementInput[]
}
