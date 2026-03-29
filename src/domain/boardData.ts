// src/domain/boardData.ts
// board-data helpers — create, reset, extract, & normalize persisted boards

import { DEFAULT_TITLE } from '../utils/constants'
import { buildDefaultTiers } from '../utils/constants'
import type {
  Tier,
  TierColorSpec,
  TierListData,
  TierPaletteColorSpec,
} from '../types'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
  getAutoTierColorSpec,
} from './tierColors'
import type { TierListStoreRuntimeState } from './tierListRuntime'
import type { PaletteId } from '../types'

const DEFAULT_TIER_IDS = [
  'tier-s',
  'tier-a',
  'tier-b',
  'tier-c',
  'tier-d',
  'tier-e',
]
const DEFAULT_TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E']

interface LegacyTier
{
  id?: unknown
  name?: unknown
  color?: unknown
  colorSource?: unknown
  colorSpec?: unknown
  itemIds?: unknown
}

const isPaletteColorSpec = (value: unknown): value is TierPaletteColorSpec =>
{
  if (!value || typeof value !== 'object')
  {
    return false
  }

  const spec = value as Record<string, unknown>

  return (
    spec.kind === 'palette' &&
    (spec.paletteType === 'default' || spec.paletteType === 'preset') &&
    typeof spec.index === 'number'
  )
}

const isCanonicalTierColorSpec = (value: unknown): value is TierColorSpec =>
{
  if (!value || typeof value !== 'object')
  {
    return false
  }

  const spec = value as Record<string, unknown>

  if (isPaletteColorSpec(value))
  {
    return true
  }

  return spec.kind === 'custom' && typeof spec.hex === 'string'
}

const isLegacyColorSource = (
  value: unknown
): value is {
  paletteType: TierPaletteColorSpec['paletteType']
  index: number
} =>
{
  if (!value || typeof value !== 'object')
  {
    return false
  }

  const source = value as Record<string, unknown>

  return (
    (source.paletteType === 'default' || source.paletteType === 'preset') &&
    typeof source.index === 'number'
  )
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
  if (isCanonicalTierColorSpec(tier.colorSpec))
  {
    return tier.colorSpec
  }

  if (isLegacyColorSource(tier.colorSource))
  {
    return createPaletteTierColorSpec(
      tier.colorSource.paletteType,
      tier.colorSource.index
    )
  }

  if (isDefaultTierIdentity(tier, index))
  {
    return createPaletteTierColorSpec('default', index)
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
    typeof tier.id === 'string'
      ? tier.id
      : (DEFAULT_TIER_IDS[index] ?? `tier-${crypto.randomUUID()}`),
  name:
    typeof tier.name === 'string'
      ? tier.name
      : (DEFAULT_TIER_NAMES[index] ?? `Tier ${index + 1}`),
  colorSpec: normalizeTierColorSpec(tier, index, paletteId),
  itemIds: Array.isArray(tier.itemIds)
    ? tier.itemIds.filter((id): id is string => typeof id === 'string')
    : [],
})

export const createInitialBoardData = (
  paletteId: PaletteId,
  title = DEFAULT_TITLE
): TierListData => ({
  title,
  tiers: buildDefaultTiers(paletteId),
  deletedItems: [],
  items: {},
  unrankedItemIds: [],
})

export const extractBoardData = (
  state: Pick<
    TierListStoreRuntimeState,
    'title' | 'tiers' | 'unrankedItemIds' | 'items' | 'deletedItems'
  >
): TierListData => ({
  title: state.title,
  tiers: state.tiers,
  unrankedItemIds: state.unrankedItemIds,
  items: state.items,
  deletedItems: state.deletedItems,
})

export const resetBoardData = (
  state: Pick<
    TierListStoreRuntimeState,
    'title' | 'items' | 'deletedItems' | 'tiers' | 'unrankedItemIds'
  >,
  paletteId: PaletteId
): TierListData =>
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

export const normalizeTierListData = (
  value: Partial<TierListData> | null | undefined,
  paletteId: PaletteId,
  fallbackTitle = DEFAULT_TITLE
): TierListData =>
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
