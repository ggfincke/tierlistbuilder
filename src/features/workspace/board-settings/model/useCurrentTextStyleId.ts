// src/features/workspace/board-settings/model/useCurrentTextStyleId.ts
// resolve the active text style for workspace renderers

import { useCurrentBoardOverride } from '~/features/workspace/board-settings/model/useCurrentBoardOverride'

export const useCurrentTextStyleId = () =>
  useCurrentBoardOverride(
    (state) => state.textStyleId,
    (state) => state.textStyleId
  )
