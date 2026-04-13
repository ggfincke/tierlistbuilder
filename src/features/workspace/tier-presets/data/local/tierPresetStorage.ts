// src/features/workspace/tier-presets/data/local/tierPresetStorage.ts
// tier-preset persistence config & migration helpers

import type { TierPreset } from '@/features/workspace/tier-presets/model/contract'
import {
  createPaletteTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '@/shared/theme/tierColors'
import { generatePresetId, isPresetId } from '@/shared/lib/id'

export const PRESET_STORAGE_KEY = 'tier-list-builder-presets'

export const PRESET_STORAGE_VERSION = 2

const normalizePresetColorSpec = (value: unknown) =>
  normalizeCanonicalTierColorSpec(value) ?? createPaletteTierColorSpec(0)

const normalizePersistedPresets = (value: unknown): TierPreset[] =>
{
  if (!Array.isArray(value))
  {
    return []
  }

  return value
    .map((entry): TierPreset | null =>
    {
      if (!entry || typeof entry !== 'object')
      {
        return null
      }

      const preset = entry as Record<string, unknown>
      const tiers = Array.isArray(preset.tiers) ? preset.tiers : []

      return {
        id:
          typeof preset.id === 'string' && isPresetId(preset.id)
            ? preset.id
            : generatePresetId(),
        name: typeof preset.name === 'string' ? preset.name : 'Untitled Preset',
        builtIn: false,
        tiers: tiers
          .filter(
            (tier): tier is Record<string, unknown> =>
              !!tier && typeof tier === 'object'
          )
          .map((tier, index) => ({
            name:
              typeof tier.name === 'string' ? tier.name : `Tier ${index + 1}`,
            description:
              typeof tier.description === 'string'
                ? tier.description
                : undefined,
            colorSpec: normalizePresetColorSpec(tier.colorSpec),
          })),
      }
    })
    .filter((preset): preset is TierPreset => preset !== null)
}

// migrate persisted preset storage into the current canonical shape
export const migrateTierPresetState = (
  persisted: unknown
): Record<string, unknown> =>
{
  const state = (persisted as Record<string, unknown> | undefined) ?? {}

  return {
    ...state,
    userPresets: normalizePersistedPresets(state.userPresets),
  }
}
