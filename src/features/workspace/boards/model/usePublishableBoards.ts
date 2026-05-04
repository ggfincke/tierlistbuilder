// src/features/workspace/boards/model/usePublishableBoards.ts
// expose local non-empty boards for publish flows

import { useMemo } from 'react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardStorageKey,
  loadBoardFromStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { readBrowserStorageItem } from '~/shared/lib/browserStorage'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

export interface PublishableBoard
{
  boardId: BoardId
  boardExternalId: string
  title: string
  itemCount: number
  createdAt: number
}

const countActiveItems = (
  snapshotItems: Record<string, unknown> | undefined
): number => (snapshotItems ? Object.keys(snapshotItems).length : 0)

interface CachedEntry
{
  envelope: string | null
  title: string
  createdAt: number
  // null when the envelope is empty/missing & shouldn't surface as publishable
  publishable: PublishableBoard | null
}

const entryCache = new Map<BoardId, CachedEntry>()

export const usePublishableBoards = (): {
  boards: readonly PublishableBoard[]
  hasEmptyBoards: boolean
} =>
{
  const registry = useWorkspaceBoardRegistryStore((state) => state.boards)

  return useMemo(() =>
  {
    const boards: PublishableBoard[] = []
    let hasEmptyBoards = false

    for (const meta of registry)
    {
      const envelope = readBrowserStorageItem(boardStorageKey(meta.id))
      const cached = entryCache.get(meta.id)
      if (
        cached &&
        cached.envelope === envelope &&
        cached.title === meta.title &&
        cached.createdAt === meta.createdAt
      )
      {
        if (cached.publishable) boards.push(cached.publishable)
        else hasEmptyBoards = true
        continue
      }

      const result = loadBoardFromStorage(meta.id)
      if (result.status !== 'ok' || !result.data)
      {
        entryCache.delete(meta.id)
        continue
      }

      const itemCount = countActiveItems(result.data.items)
      if (itemCount === 0)
      {
        entryCache.set(meta.id, {
          envelope,
          title: meta.title,
          createdAt: meta.createdAt,
          publishable: null,
        })
        hasEmptyBoards = true
        continue
      }

      const publishable: PublishableBoard = {
        boardId: meta.id,
        boardExternalId: meta.id,
        title: result.data.title || meta.title,
        itemCount,
        createdAt: meta.createdAt,
      }
      entryCache.set(meta.id, {
        envelope,
        title: meta.title,
        createdAt: meta.createdAt,
        publishable,
      })
      boards.push(publishable)
    }

    boards.sort((a, b) => b.createdAt - a.createdAt)

    return { boards, hasEmptyBoards }
  }, [registry])
}
