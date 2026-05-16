// src/features/workspace/sync/useWorkspaceBoardSyncSubscriber.ts
// subscribes to active board edits & forwards durable snapshots to workspace sync

import { useEffect, useRef } from 'react'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  setBoardChangedListener,
  setBoardLoadedListener,
} from '~/features/workspace/boards/model/boardSession'
import { readBoardStateForCloudSync } from '~/features/workspace/boards/data/cloud/cloudFlush'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
  selectBoardDataSource,
} from '~/shared/board-data/boardSnapshot'
import { extractBoardSyncState } from '~/features/workspace/boards/model/sync'
import type { PendingBoardSync } from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'

interface WorkspaceBoardSyncSubscriberOptions
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
  const shouldProceedRef = useRef(shouldProceed)
  const lastLoadedBoardIdRef = useRef(
    useWorkspaceBoardRegistryStore.getState().activeBoardId
  )

  useEffect(() =>
  {
    shouldProceedRef.current = shouldProceed
    isMergePendingRef.current = isMergePending
    onEditRef.current = onEdit
  })

  useEffect(() =>
  {
    const queuePendingBoard = (boardId: BoardId, markLoaded = false): void =>
    {
      if (markLoaded)
      {
        lastLoadedBoardIdRef.current = boardId
      }

      const canProceed = shouldProceedRef.current
      if (!canProceed || !canProceed() || isMergePendingRef.current()) return

      const { snapshot, syncState } = readBoardStateForCloudSync(boardId)
      if (syncState.pendingSyncAt === null) return

      onEditRef.current({
        boardId,
        snapshot,
        boardDataSelection: selectBoardDataFields(snapshot),
        syncState,
      })
    }

    setBoardLoadedListener((boardId) => queuePendingBoard(boardId, true))
    setBoardChangedListener((boardId) => queuePendingBoard(boardId))

    return () =>
    {
      setBoardLoadedListener(null)
      setBoardChangedListener(null)
    }
  }, [])

  useEffect(() =>
  {
    if (!shouldProceed) return

    lastLoadedBoardIdRef.current =
      useWorkspaceBoardRegistryStore.getState().activeBoardId

    const unsubscribe = useActiveBoardStore.subscribe(
      selectBoardDataSource,
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
