// src/features/workspace/board-settings/model/useCurrentPageBackground.ts
// resolve the active workspace page background override

import { useCurrentBoardOverride } from '~/features/workspace/board-settings/model/useCurrentBoardOverride'

export const useCurrentPageBackground = (): string | null =>
  useCurrentBoardOverride(
    (state) => state.boardBackgroundOverride,
    (state) => state.pageBackground
  )
