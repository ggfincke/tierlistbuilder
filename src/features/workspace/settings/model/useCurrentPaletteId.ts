// src/features/workspace/settings/model/useCurrentPaletteId.ts
// read the active tier palette from the settings store

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'

export const useCurrentPaletteId = () =>
  useSettingsStore((state) => state.paletteId)
