// src/features/workspace/settings/model/useCurrentBoardOverride.ts
// resolve a board override over its user-default preference

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

type PreferencesState = ReturnType<typeof usePreferencesStore.getState>
type ActiveBoardState = ReturnType<typeof useActiveBoardStore.getState>

export const useCurrentBoardOverride = <T>(
  selectUserDefault: (state: PreferencesState) => T,
  selectBoardOverride: (state: ActiveBoardState) => T | undefined
): T =>
{
  const userDefault = usePreferencesStore(selectUserDefault)
  const boardOverride = useActiveBoardStore(selectBoardOverride)
  return boardOverride ?? userDefault
}
