// src/store/usePresetStore.ts
// user-saved board presets — persisted independently of boards & settings

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TierPreset } from '../types'
import { createAppPersistStorage } from '../utils/storage'

export const PRESET_STORAGE_KEY = 'tier-list-builder-presets'

interface PresetStore
{
  userPresets: TierPreset[]
  addPreset: (preset: TierPreset) => void
  removePreset: (presetId: string) => void
  renamePreset: (presetId: string, name: string) => void
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
      version: 1,
    }
  )
)
