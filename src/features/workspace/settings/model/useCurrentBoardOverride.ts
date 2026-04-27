// src/features/workspace/settings/model/useCurrentBoardOverride.ts
// resolve a board override over its user-default setting

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'

type SettingsState = ReturnType<typeof useSettingsStore.getState>
type ActiveBoardState = ReturnType<typeof useActiveBoardStore.getState>

export const useCurrentBoardOverride = <T>(
  selectUserDefault: (state: SettingsState) => T,
  selectBoardOverride: (state: ActiveBoardState) => T | undefined
): T =>
{
  const userDefault = useSettingsStore(selectUserDefault)
  const boardOverride = useActiveBoardStore(selectBoardOverride)
  return boardOverride ?? userDefault
}
