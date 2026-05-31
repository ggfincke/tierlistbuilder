// src/features/workspace/tier-presets/model/tierPresets.ts
// board preset definitions & conversion helpers

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type {
  TierPreset,
  TierPresetTier,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  generatePresetId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import { DEFAULT_TITLE } from '~/shared/board-data/boardDefaults'

// built-in presets live in contracts so the convex seed can share them
export { BUILTIN_PRESETS } from '@tierlistbuilder/contracts/workspace/tierPreset'

// convert a preset into fresh board data w/ generated tier IDs
export const createBoardDataFromPreset = (
  preset: TierPreset,
  title = DEFAULT_TITLE
): BoardSnapshot => ({
  title,
  tiers: preset.tiers.map((t) =>
  {
    const tier: BoardSnapshot['tiers'][number] = {
      id: generateTierId(),
      name: t.name,
      description: t.description,
      colorSpec: t.colorSpec,
      itemIds: [],
    }
    if (t.rowColorSpec) tier.rowColorSpec = t.rowColorSpec
    return tier
  }),
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

// extract a preset from existing board data (strips items, keeps structure)
export const extractPresetFromBoard = (
  data: BoardSnapshot,
  name: string
): TierPreset => ({
  id: generatePresetId(),
  name,
  builtIn: false,
  tiers: data.tiers.map((tier) =>
  {
    const presetTier: TierPresetTier = {
      name: tier.name,
      colorSpec: tier.colorSpec,
      description: tier.description,
    }
    if (tier.rowColorSpec) presetTier.rowColorSpec = tier.rowColorSpec
    return presetTier
  }),
})
