// tests/platform/pendingSyncRecovery.test.ts
// pending sync recovery must not replay another auth epoch's local board edits

import { afterEach, describe, expect, it } from 'vitest'
import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  loadBoardFromStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import {
  EMPTY_BOARD_SYNC_STATE,
  markBoardPendingSync,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { resumePendingSyncs } from '~/features/workspace/sync/pendingSyncRecovery'
import { makeBoardMeta, makeBoardSnapshot } from '../fixtures'
import type { PendingBoardSync } from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'

const BOARD_A = asBoardId('board-pending-a')
const BOARD_B = asBoardId('board-pending-b')
const BOARD_LEGACY = asBoardId('board-pending-legacy')
const BOARD_CLEAN = asBoardId('board-clean')

const resetRegistry = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({ boards: [], activeBoardId: null })
}

const seedBoard = (
  boardId: BoardId,
  title: string,
  syncState: BoardSyncState
): void =>
{
  saveBoardToStorage(boardId, makeBoardSnapshot({ title }), { syncState })
}

describe('pendingSyncRecovery', () =>
{
  afterEach(() =>
  {
    resetRegistry()
  })

  it('queues same-user board markers and clears foreign or legacy markers', () =>
  {
    seedBoard(
      BOARD_A,
      'User A pending',
      markBoardPendingSync(EMPTY_BOARD_SYNC_STATE, 100, 'user-a')
    )
    seedBoard(
      BOARD_B,
      'User B pending',
      markBoardPendingSync(EMPTY_BOARD_SYNC_STATE, 200, 'user-b')
    )
    seedBoard(
      BOARD_LEGACY,
      'Legacy pending',
      markBoardPendingSync(EMPTY_BOARD_SYNC_STATE, 300)
    )
    seedBoard(BOARD_CLEAN, 'Clean board', EMPTY_BOARD_SYNC_STATE)
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        makeBoardMeta({ id: BOARD_A, title: 'User A pending' }),
        makeBoardMeta({ id: BOARD_B, title: 'User B pending' }),
        makeBoardMeta({ id: BOARD_LEGACY, title: 'Legacy pending' }),
        makeBoardMeta({ id: BOARD_CLEAN, title: 'Clean board' }),
      ],
      activeBoardId: null,
    })

    const queued: PendingBoardSync[] = []
    const result = resumePendingSyncs({
      userId: 'user-a',
      queueBoard: (work) => queued.push(work),
    })

    expect(result.resumedBoardIds).toEqual([BOARD_A])
    expect(queued.map((work) => work.boardId)).toEqual([BOARD_A])
    expect(queued[0]?.snapshot.title).toBe('User A pending')
    expect(queued[0]?.syncState).toMatchObject({
      pendingSyncAt: 100,
      pendingSyncOwnerUserId: 'user-a',
    })
    expect(loadBoardFromStorage(BOARD_A).sync).toMatchObject({
      pendingSyncAt: 100,
      pendingSyncOwnerUserId: 'user-a',
    })
    expect(loadBoardFromStorage(BOARD_B).sync).toMatchObject({
      pendingSyncAt: null,
      pendingSyncOwnerUserId: null,
    })
    expect(loadBoardFromStorage(BOARD_LEGACY).sync).toMatchObject({
      pendingSyncAt: null,
      pendingSyncOwnerUserId: null,
    })
  })
})
