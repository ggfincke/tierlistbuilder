// src/features/workspace/tier-presets/model/tierPresetStorageMigration.ts
// normalize persisted user preset payloads across storage versions

import type {
  TierPreset,
  TierPresetTier,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import { asPresetId } from '@tierlistbuilder/contracts/lib/ids'
import { isRecord } from '~/shared/lib/typeGuards'
import {
  createPaletteTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '~/shared/theme/tierColors'

const normalizePresetTier = (
  value: unknown,
  index: number
): TierPresetTier | null =>
{
  if (!isRecord(value))
  {
    return null
  }

  return {
    name:
      typeof value.name === 'string' && value.name.trim()
        ? value.name
        : `Tier ${index + 1}`,
    colorSpec:
      normalizeCanonicalTierColorSpec(value.colorSpec) ??
      createPaletteTierColorSpec(index),
    rowColorSpec:
      normalizeCanonicalTierColorSpec(value.rowColorSpec) ?? undefined,
    description:
      typeof value.description === 'string' ? value.description : undefined,
  }
}

const normalizePreset = (value: unknown): TierPreset | null =>
{
  if (!isRecord(value) || typeof value.id !== 'string')
  {
    return null
  }

  const tiers = Array.isArray(value.tiers)
    ? value.tiers
        .map((tier, index) => normalizePresetTier(tier, index))
        .filter((tier): tier is TierPresetTier => tier !== null)
    : []

  return {
    id: asPresetId(value.id),
    name:
      typeof value.name === 'string' && value.name.trim()
        ? value.name
        : 'Untitled Preset',
    builtIn: typeof value.builtIn === 'boolean' ? value.builtIn : false,
    tiers,
  }
}

export const migrateTierPresetState = (
  persistedState: unknown
): {
  userPresets: TierPreset[]
} =>
{
  if (!isRecord(persistedState) || !Array.isArray(persistedState.userPresets))
  {
    return { userPresets: [] }
  }

  return {
    userPresets: persistedState.userPresets
      .map((preset) => normalizePreset(preset))
      .filter((preset): preset is TierPreset => preset !== null),
  }
}
