// src/hooks/useCurrentPaletteId.ts
// read the active tier palette from the settings store

import { useSettingsStore } from '../store/useSettingsStore'

export const useCurrentPaletteId = () =>
  useSettingsStore((state) => state.paletteId)
