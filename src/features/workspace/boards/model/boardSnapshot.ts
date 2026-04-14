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
import { asItemId, type ItemId } from '@/shared/types/ids'
import type { PaletteId } from '@/shared/types/theme'
import {
  getAutoTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '@/shared/theme/tierColors'
import type { ActiveBoardRuntimeState } from './runtime'

interface RawTier
{
  id?: unknown
  name?: unknown
  description?: unknown
  colorSpec?: unknown
  rowColorSpec?: unknown
  itemIds?: unknown
}

// filter out non-string entries from a raw itemIds array & brand the rest
const normalizeItemIds = (raw: unknown): ItemId[] =>
{
  if (!Array.isArray(raw))
  {
    return []
  }

  const result: ItemId[] = []
  for (const value of raw)
  {
    if (typeof value === 'string')
    {
      result.push(asItemId(value))
    }
  }
  return result
}

const normalizeTier = (
  tier: RawTier,
  index: number,
  paletteId: PaletteId
): Tier =>
{
  const rowColorSpec = normalizeCanonicalTierColorSpec(tier.rowColorSpec)

  const normalized: Tier = {
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
    colorSpec:
      normalizeCanonicalTierColorSpec(tier.colorSpec) ??
      getAutoTierColorSpec(paletteId, index),
    itemIds: normalizeItemIds(tier.itemIds),
  }

  if (rowColorSpec) normalized.rowColorSpec = rowColorSpec
  return normalized
}

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
        normalizeTier(tier as RawTier, index, paletteId)
      )
    : buildDefaultTiers(paletteId)

  return {
    title: value?.title ?? fallbackTitle,
    tiers,
    unrankedItemIds: normalizeItemIds(value?.unrankedItemIds),
    items: value?.items && typeof value.items === 'object' ? value.items : {},
    deletedItems: Array.isArray(value?.deletedItems) ? value.deletedItems : [],
  }
}
