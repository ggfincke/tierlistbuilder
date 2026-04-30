// tests/model/boardConflictResolution.test.ts
// board conflict resolution persists explicit cloud external IDs

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { resolveKeepCloud } from '~/features/workspace/boards/model/boardConflictResolution'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'

const BOARD_ID = 'board-conflict-local' as BoardId

const serverState = (title: string, revision: number): CloudBoardState => ({
  title,
  revision,
  tiers: [],
  items: [],
})

const resetStores = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({
    boards: [],
    activeBoardId: null,
  })
  useActiveBoardStore.setState({
    ...createInitialBoardData('classic'),
    past: [],
    future: [],
    activeItemId: null,
    dragPreview: null,
    dragGroupIds: [],
    keyboardMode: 'idle',
    keyboardFocusItemId: null,
    selection: { ids: [], set: new Set() },
    lastClickedItemId: null,
    itemsManuallyMoved: false,
    runtimeError: null,
    lastSyncedRevision: null,
    cloudBoardExternalId: null,
    pendingSyncAt: null,
  })
}

describe('board conflict resolution', () =>
{
  beforeEach(() =>
  {
    resetStores()
  })

  afterEach(() =>
  {
    resetStores()
  })

  it('keeps the cloud external ID when local and cloud board IDs diverge', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [{ id: BOARD_ID, title: 'Local', createdAt: 1 }],
      activeBoardId: null,
    })
    saveBoardToStorage(BOARD_ID, {
      ...createInitialBoardData('classic'),
      title: 'Local',
    })

    const outcome = await resolveKeepCloud({
      boardId: BOARD_ID,
      cloudBoardExternalId: 'cloud-real-board-id',
      serverState: serverState('Cloud', 42),
    })

    const loaded = loadBoardFromStorage(BOARD_ID)
    expect(outcome).toEqual({ ok: true })
    expect(loaded.status).toBe('ok')
    expect(loaded.sync).toEqual({
      lastSyncedRevision: 42,
      cloudBoardExternalId: 'cloud-real-board-id',
      pendingSyncAt: null,
    })
    expect(loaded.data?.title).toBe('Cloud')
    expect(useWorkspaceBoardRegistryStore.getState().boards[0]?.title).toBe(
      'Cloud'
    )
  })
})
