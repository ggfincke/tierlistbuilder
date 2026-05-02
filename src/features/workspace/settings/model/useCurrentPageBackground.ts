// src/features/workspace/settings/model/useCurrentPageBackground.ts
// resolve the active workspace page background override

import { useCurrentBoardOverride } from './useCurrentBoardOverride'

export const useCurrentPageBackground = (): string | null =>
  useCurrentBoardOverride(
    (state) => state.boardBackgroundOverride,
    (state) => state.pageBackground
  )
