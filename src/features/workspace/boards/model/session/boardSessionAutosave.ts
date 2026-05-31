// src/features/workspace/boards/model/session/boardSessionAutosave.ts
// active-board autosave subscription & load-suppression state

import { boardDataFieldsEqual } from '~/shared/board-data/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'

let saveTimeout: ReturnType<typeof setTimeout> | null = null
let autosaveUnsubscribe: (() => void) | null = null
let suppressNextAutosave = false
let showcaseEditingActive = false

// gate the global autosave while the showcase editor borrows the active store,
// so showcase edits never persist to the user's real board
export const setShowcaseEditingActive = (active: boolean): void =>
{
  showcaseEditingActive = active
}

export const clearPendingAutosave = (): void =>
{
  if (!saveTimeout)
  {
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = null
}

export const runWithAutosaveSuppressed = <T>(run: () => T): T =>
{
  suppressNextAutosave = true
  try
  {
    return run()
  }
  finally
  {
    suppressNextAutosave = false
  }
}

const consumeAutosaveSuppression = (): boolean =>
{
  if (!suppressNextAutosave)
  {
    return false
  }

  suppressNextAutosave = false
  return true
}

export const registerBoardAutosaveController = (
  saveActiveBoardSnapshot: () => void
): (() => void) =>
{
  if (autosaveUnsubscribe)
  {
    return autosaveUnsubscribe
  }

  const unsubscribe = useActiveBoardStore.subscribe(
    (state) => state,
    () =>
    {
      if (showcaseEditingActive)
      {
        return
      }
      if (consumeAutosaveSuppression())
      {
        return
      }

      clearPendingAutosave()

      saveTimeout = setTimeout(() =>
      {
        saveTimeout = null
        saveActiveBoardSnapshot()
      }, 300)
    },
    { equalityFn: boardDataFieldsEqual }
  )

  autosaveUnsubscribe = () =>
  {
    clearPendingAutosave()
    unsubscribe()
    autosaveUnsubscribe = null
  }

  return autosaveUnsubscribe
}
