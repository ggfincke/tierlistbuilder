// src/features/workspace/boards/model/usePublishableBoards.ts
// expose local non-empty boards for publish flows

import { useMemo } from 'react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardStorageKey,
  parseBoardEnvelope,
} from '~/features/workspace/boards/data/local/boardStorage'
import { readBrowserStorageItem } from '~/shared/lib/browserStorage'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'

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

interface PublishableBoardsResult
{
  boards: readonly PublishableBoard[]
  hasEmptyBoards: boolean
}

const pruneEntryCache = (registry: readonly BoardMeta[]): void =>
{
  const activeIds = new Set(registry.map((meta) => meta.id))
  for (const cachedId of entryCache.keys())
  {
    if (!activeIds.has(cachedId)) entryCache.delete(cachedId)
  }
}

export const projectPublishableBoards = (
  registry: readonly BoardMeta[]
): PublishableBoardsResult =>
{
  pruneEntryCache(registry)

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

    const result = parseBoardEnvelope(envelope)
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
}

export const usePublishableBoards = (): PublishableBoardsResult =>
{
  const registry = useWorkspaceBoardRegistryStore((state) => state.boards)

  return useMemo(() => projectPublishableBoards(registry), [registry])
}

// test-only: drop module-level cache so cases starting from a fresh
// registry don't reuse stale CachedEntry rows seeded by earlier tests
export const __resetPublishableBoardsCacheForTests = (): void =>
{
  entryCache.clear()
}
