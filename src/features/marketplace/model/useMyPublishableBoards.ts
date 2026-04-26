// src/features/marketplace/model/useMyPublishableBoards.ts
// joins local registry w/ persisted snapshots to drive the publish-modal
// board picker; filters to cloud-synced & non-empty boards

import { useMemo } from 'react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

export interface PublishableBoard
{
  boardId: BoardId
  boardExternalId: string
  title: string
  itemCount: number
  updatedAt: number | null
}

const countActiveItems = (
  snapshotItems: Record<string, unknown> | undefined
): number => (snapshotItems ? Object.keys(snapshotItems).length : 0)

// recompute on every render — registry is a Zustand store so the subscription
// keeps the result fresh; loadBoardFromStorage is a synchronous localStorage
// read & each user typically has < 50 boards
export const useMyPublishableBoards = (): {
  boards: readonly PublishableBoard[]
  hasUnsyncedBoards: boolean
} =>
{
  const registry = useWorkspaceBoardRegistryStore((state) => state.boards)

  return useMemo(() =>
  {
    const boards: PublishableBoard[] = []
    let hasUnsyncedBoards = false

    for (const meta of registry)
    {
      const result = loadBoardFromStorage(meta.id)
      if (result.status !== 'ok' || !result.data) continue

      const cloudId = result.sync.cloudBoardExternalId
      const itemCount = countActiveItems(result.data.items)

      if (!cloudId || result.sync.pendingSyncAt !== null || itemCount === 0)
      {
        if (!cloudId || result.sync.pendingSyncAt !== null)
        {
          hasUnsyncedBoards = true
        }
        continue
      }

      boards.push({
        boardId: meta.id,
        boardExternalId: cloudId,
        title: result.data.title || meta.title,
        itemCount,
        updatedAt: meta.createdAt,
      })
    }

    boards.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

    return { boards, hasUnsyncedBoards }
  }, [registry])
}
