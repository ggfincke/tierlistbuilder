// src/features/workspace/boards/model/boardSnapshot.ts
// board-data helpers — create, reset, extract, & normalize persisted boards

import {
  DEFAULT_TIER_IDS,
  DEFAULT_TIER_NAMES,
  DEFAULT_TITLE,
  buildDefaultTiers,
} from '@/features/workspace/boards/lib/boardDefaults'
import { generateTierId, isTierId } from '@/shared/lib/id'
import type {
  BoardSnapshot,
  Tier,
} from '@/features/workspace/boards/model/contract'
import type { PaletteId, TierColorSpec } from '@/shared/types/theme'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
  getAutoTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '@/shared/theme/tierColors'
import type { ActiveBoardRuntimeState } from './runtime'

interface LegacyTier
{
  id?: unknown
  name?: unknown
  description?: unknown
  color?: unknown
  colorSource?: unknown
  colorSpec?: unknown
  itemIds?: unknown
}

const isLegacyColorSource = (value: unknown): value is { index: number } =>
{
  if (!value || typeof value !== 'object')
  {
    return false
  }

  const source = value as Record<string, unknown>

  return typeof source.index === 'number'
}

const isDefaultTierIdentity = (tier: LegacyTier, index: number): boolean =>
{
  return (
    tier.id === DEFAULT_TIER_IDS[index] &&
    tier.name === DEFAULT_TIER_NAMES[index]
  )
}

const normalizeTierColorSpec = (
  tier: LegacyTier,
  index: number,
  paletteId: PaletteId
): TierColorSpec =>
{
  const normalizedColorSpec = normalizeCanonicalTierColorSpec(tier.colorSpec)

  if (normalizedColorSpec)
  {
    return normalizedColorSpec
  }

  if (isLegacyColorSource(tier.colorSource))
  {
    return createPaletteTierColorSpec(tier.colorSource.index)
  }

  if (isDefaultTierIdentity(tier, index))
  {
    return createPaletteTierColorSpec(index)
  }

  if (typeof tier.color === 'string')
  {
    return createCustomTierColorSpec(tier.color)
  }

  return getAutoTierColorSpec(paletteId, index)
}

const normalizeTier = (
  tier: LegacyTier,
  index: number,
  paletteId: PaletteId
): Tier => ({
  id:
    typeof tier.id === 'string' && isTierId(tier.id)
      ? tier.id
      : (DEFAULT_TIER_IDS[index] ?? generateTierId()),
  name:
    typeof tier.name === 'string'
      ? tier.name
      : (DEFAULT_TIER_NAMES[index] ?? `Tier ${index + 1}`),
  description:
    typeof tier.description === 'string' ? tier.description : undefined,
  colorSpec: normalizeTierColorSpec(tier, index, paletteId),
  itemIds: Array.isArray(tier.itemIds)
    ? tier.itemIds.filter((id): id is string => typeof id === 'string')
    : [],
})

export const createInitialBoardData = (
  paletteId: PaletteId,
  title = DEFAULT_TITLE
): BoardSnapshot => ({
  title,
  tiers: buildDefaultTiers(paletteId),
  deletedItems: [],
  items: {},
  unrankedItemIds: [],
})

// build a single new tier w/ a generated ID & auto-assigned palette color
export const createNewTier = (
  paletteId: PaletteId,
  tierCount: number
): Tier => ({
  id: generateTierId(),
  name: `Tier ${tierCount + 1}`,
  colorSpec: getAutoTierColorSpec(paletteId, tierCount),
  itemIds: [],
})

export const extractBoardData = (
  state: Pick<
    ActiveBoardRuntimeState,
    'title' | 'tiers' | 'unrankedItemIds' | 'items' | 'deletedItems'
  >
): BoardSnapshot => ({
  title: state.title,
  tiers: state.tiers,
  unrankedItemIds: state.unrankedItemIds,
  items: state.items,
  deletedItems: state.deletedItems,
})

export const resetBoardData = (
  state: Pick<
    ActiveBoardRuntimeState,
    'title' | 'items' | 'deletedItems' | 'tiers' | 'unrankedItemIds'
  >,
  paletteId: PaletteId
): BoardSnapshot =>
{
  const allItemIds = [
    ...state.tiers.flatMap((tier) => tier.itemIds),
    ...state.unrankedItemIds,
  ]

  return {
    title: state.title,
    tiers: buildDefaultTiers(paletteId),
    unrankedItemIds: allItemIds,
    items: state.items,
    deletedItems: state.deletedItems,
  }
}

export const normalizeBoardSnapshot = (
  value: Partial<BoardSnapshot> | null | undefined,
  paletteId: PaletteId,
  fallbackTitle = DEFAULT_TITLE
): BoardSnapshot =>
{
  const tiers = Array.isArray(value?.tiers)
    ? value.tiers.map((tier, index) =>
        normalizeTier(tier as LegacyTier, index, paletteId)
      )
    : buildDefaultTiers(paletteId)

  return {
    title: value?.title ?? fallbackTitle,
    tiers,
    unrankedItemIds: Array.isArray(value?.unrankedItemIds)
      ? value.unrankedItemIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : [],
    items: value?.items && typeof value.items === 'object' ? value.items : {},
    deletedItems: Array.isArray(value?.deletedItems) ? value.deletedItems : [],
  }
}
