// src/features/workspace/tier-presets/model/useTierPresetStore.ts
// user-saved board presets — persisted independently of boards & settings

import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { PresetId } from '@tierlistbuilder/contracts/lib/ids'
import { createAppPersistStorage } from '~/shared/lib/browserStorage'
import {
  PRESET_STORAGE_KEY,
  PRESET_STORAGE_VERSION,
} from '../data/local/tierPresetStorage'

interface TierPresetStore
{
  userPresets: TierPreset[]
  addPreset: (preset: TierPreset) => void
  removePreset: (presetId: PresetId) => void
  renamePreset: (presetId: PresetId, name: string) => void
}

// subscribeWithSelector is wrapped around persist so userPresets projections
// can diff arrays structurally instead of by reference
export const useTierPresetStore = create<TierPresetStore>()(
  subscribeWithSelector(
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
        version: PRESET_STORAGE_VERSION,
      }
    )
  )
)
