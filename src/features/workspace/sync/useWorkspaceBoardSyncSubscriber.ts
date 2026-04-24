// src/features/workspace/sync/useWorkspaceBoardSyncSubscriber.ts
// subscribes to active board edits & forwards durable snapshots to workspace sync

import { useEffect, useRef } from 'react'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { setBoardLoadedListener } from '~/features/workspace/boards/model/boardSession'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import { extractBoardSyncState } from '~/features/workspace/boards/model/sync'
import type { PendingBoardSync } from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'

export interface WorkspaceBoardSyncSubscriberOptions
{
  shouldProceed: (() => boolean) | null
  isMergePending: () => boolean
  onEdit: (work: PendingBoardSync) => void
}

export const useWorkspaceBoardSyncSubscriber = ({
  shouldProceed,
  isMergePending,
  onEdit,
}: WorkspaceBoardSyncSubscriberOptions): void =>
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

        if (boardId !== lastLoadedBoardIdRef.current)
        {
          lastLoadedBoardIdRef.current = boardId
          return
        }

        const state = useActiveBoardStore.getState()
        onEditRef.current({
          boardId,
          snapshot: extractBoardData(state),
          boardDataSelection: selectBoardDataFields(state),
          syncState: extractBoardSyncState(state),
        })
      },
      { equalityFn: boardDataFieldsEqual }
    )

    return () =>
    {
      unsubscribe()
    }
  }, [shouldProceed])
}
