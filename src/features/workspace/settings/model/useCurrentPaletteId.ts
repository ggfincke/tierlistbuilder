// src/features/workspace/settings/model/useCurrentPaletteId.ts
// resolve the active tier palette for workspace renderers

import { useCurrentBoardOverride } from '~/features/workspace/settings/model/useCurrentBoardOverride'

export const useCurrentPaletteId = () =>
  useCurrentBoardOverride(
    (state) => state.paletteId,
    (state) => state.paletteId
  )
