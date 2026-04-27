// src/features/workspace/settings/model/useCurrentTextStyleId.ts
// resolve the active text style for workspace renderers

import { useCurrentBoardOverride } from './useCurrentBoardOverride'

export const useCurrentTextStyleId = () =>
  useCurrentBoardOverride(
    (state) => state.textStyleId,
    (state) => state.textStyleId
  )
