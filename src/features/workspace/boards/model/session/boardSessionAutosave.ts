// src/features/workspace/boards/model/session/boardSessionAutosave.ts
// active-board autosave subscription & load-suppression state

import {
  boardDataFieldsEqual,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'

let saveTimeout: ReturnType<typeof setTimeout> | null = null
let autosaveUnsubscribe: (() => void) | null = null
let suppressNextAutosave = false

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
    selectBoardDataFields,
    () =>
    {
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
