// src/features/workspace/settings/model/useCurrentPaletteId.ts
// resolve the active tier palette for workspace renderers

import { useCurrentBoardOverride } from './useCurrentBoardOverride'

export const useCurrentPaletteId = () =>
  useCurrentBoardOverride(
    (state) => state.paletteId,
    (state) => state.paletteId
  )
