// src/hooks/useCurrentPaletteId.ts
// derive the active tier palette from the current theme selection

import { useSettingsStore } from '../store/useSettingsStore'
import { THEME_PALETTE } from '../theme'

export const useCurrentPaletteId = () =>
{
  const themeId = useSettingsStore((state) => state.themeId)
  return THEME_PALETTE[themeId]
}
