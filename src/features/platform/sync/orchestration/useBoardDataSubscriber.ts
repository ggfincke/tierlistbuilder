// src/features/platform/sync/orchestration/useBoardDataSubscriber.ts
// subscribes to active-board data fields & forwards real edits to the scheduler

import { useEffect, useRef } from 'react'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { setBoardLoadedListener } from '~/features/workspace/boards/data/local/localBoardSession'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import { extractBoardSyncState } from '~/features/workspace/boards/model/sync'
import type { PendingBoardSync } from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'

export interface BoardDataSubscriberOptions
{
  // null when the subscriber should stay detached (no active user)
  shouldProceed: (() => boolean) | null
  // getter so first-login-merge gating stays live across renders
  isMergePending: () => boolean
  onEdit: (work: PendingBoardSync) => void
}

// subscribes to persisted board-data fields via a shallow selector; skips
// the first change after a board load/switch & suppresses during merge.
// options route through refs so subscription only rebuilds on shouldProceed
export const useBoardDataSubscriber = ({
  shouldProceed,
  isMergePending,
  onEdit,
}: BoardDataSubscriberOptions): void =>
{
  const isMergePendingRef = useRef(isMergePending)
  const onEditRef = useRef(onEdit)
  const lastLoadedBoardIdRef = useRef(
    useWorkspaceBoardRegistryStore.getState().activeBoardId
  )

  useEffect(() =>
  {
    isMergePendingRef.current = isMergePending
    onEditRef.current = onEdit
  })

  useEffect(() =>
  {
    setBoardLoadedListener((boardId) =>
    {
      lastLoadedBoardIdRef.current = boardId
    })

    return () =>
    {
      setBoardLoadedListener(null)
    }
  }, [])

  useEffect(() =>
  {
    if (!shouldProceed) return

    lastLoadedBoardIdRef.current =
      useWorkspaceBoardRegistryStore.getState().activeBoardId

    const unsubscribe = useActiveBoardStore.subscribe(
      selectBoardDataFields,
      () =>
      {
        if (!shouldProceed() || isMergePendingRef.current()) return

        const boardId = useWorkspaceBoardRegistryStore.getState().activeBoardId
        if (!boardId) return

        // board loads/switches replace the active store wholesale. skip the
        // first change for a newly loaded board & only sync later user edits
        if (boardId !== lastLoadedBoardIdRef.current)
        {
          lastLoadedBoardIdRef.current = boardId
          return
        }

        const state = useActiveBoardStore.getState()
        const work: PendingBoardSync = {
          boardId,
          snapshot: extractBoardData(state),
          boardDataSelection: selectBoardDataFields(state),
          syncState: extractBoardSyncState(state),
        }
        onEditRef.current(work)
      },
      { equalityFn: boardDataFieldsEqual }
    )

    return () =>
    {
      unsubscribe()
    }
  }, [shouldProceed])
}
