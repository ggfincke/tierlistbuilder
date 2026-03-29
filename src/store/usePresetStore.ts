// src/store/usePresetStore.ts
// user-saved board presets — persisted independently of boards & settings

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TierColorSpec, TierPreset } from '../types'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
} from '../domain/tierColors'
import { createAppPersistStorage } from '../utils/storage'

export const PRESET_STORAGE_KEY = 'tier-list-builder-presets'

interface PresetStore
{
  userPresets: TierPreset[]
  addPreset: (preset: TierPreset) => void
  removePreset: (presetId: string) => void
  renamePreset: (presetId: string, name: string) => void
}

const normalizePresetColorSpec = (value: unknown): TierColorSpec =>
{
  if (value && typeof value === 'object')
  {
    const colorSpec = value as Record<string, unknown>

    if (colorSpec.kind === 'palette' && typeof colorSpec.index === 'number')
    {
      return createPaletteTierColorSpec(colorSpec.index)
    }

    if (colorSpec.kind === 'custom' && typeof colorSpec.hex === 'string')
    {
      return createCustomTierColorSpec(colorSpec.hex)
    }
  }

  return createPaletteTierColorSpec(0)
}

const normalizePersistedPresets = (value: unknown): TierPreset[] =>
{
  if (!Array.isArray(value))
  {
    return []
  }

  return value
    .map((entry) =>
    {
      if (!entry || typeof entry !== 'object')
      {
        return null
      }

      const preset = entry as Record<string, unknown>
      const tiers = Array.isArray(preset.tiers) ? preset.tiers : []
      const normalizedPreset: TierPreset = {
        id:
          typeof preset.id === 'string'
            ? preset.id
            : `preset-${crypto.randomUUID()}`,
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

      return normalizedPreset
    })
    .filter((preset): preset is TierPreset => preset !== null)
}

export const usePresetStore = create<PresetStore>()(
  persist(
    (set) => ({
      userPresets: [],

      addPreset: (preset) =>
        set((state) => ({
          userPresets: [...state.userPresets, preset],
        })),

      removePreset: (presetId) =>
        set((state) => ({
          userPresets: state.userPresets.filter((t) => t.id !== presetId),
        })),

      renamePreset: (presetId, name) =>
        set((state) => ({
          userPresets: state.userPresets.map((t) =>
            t.id === presetId ? { ...t, name: name.trim() || t.name } : t
          ),
        })),
    }),
    {
      name: PRESET_STORAGE_KEY,
      storage: createAppPersistStorage(),
      version: 2,
      migrate: (persisted) =>
      {
        const state = (persisted as Record<string, unknown> | undefined) ?? {}

        return {
          ...state,
          userPresets: normalizePersistedPresets(state.userPresets),
        }
      },
    }
  )
)
