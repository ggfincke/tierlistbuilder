// tests/model/cloudBoardActivation.test.ts
// cloud board activation keeps clean materialized boards fresh without
// clobbering boards that still have local edits waiting to sync

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  asBoardId,
  asItemId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { getBoardStateByExternalIdImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import {
  loadBoardFromStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloud/cloudBoardActivation'
import {
  EMPTY_BOARD_SYNC_STATE,
  markBoardSynced,
} from '~/features/workspace/boards/model/cloud/sync'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'

vi.mock('~/features/workspace/boards/data/cloud/boardRepository', () => ({
  getBoardStateByExternalIdImperative: vi.fn(),
}))

vi.mock('~/shared/images/imageBlobCache', () => ({
  getCachedImageUrl: vi.fn(() => null),
  warmFromBoard: vi.fn(() => Promise.resolve()),
}))

const CLOUD_BOARD_EXTERNAL_ID = 'board-cloud-activation'
const CLOUD_BOARD_ID = asBoardId(CLOUD_BOARD_EXTERNAL_ID)
const OTHER_BOARD_ID = asBoardId('board-other')

const getCloudStateMock = vi.mocked(getBoardStateByExternalIdImperative)

const makeCloudState = (
  overrides: Partial<CloudBoardState> = {}
): CloudBoardState => ({
  title: 'Cloud board',
  revision: 2,
  tiers: [
    {
      externalId: 'tier-s',
      name: 'S',
      colorSpec: { kind: 'palette', index: 0 },
      itemIds: ['item-cloud'],
      order: 0,
    },
  ],
  items: [
    {
      externalId: 'item-cloud',
      tierId: 'tier-s',
      label: 'Fresh item',
      mediaExternalId: null,
      order: 0,
      deletedAt: null,
    },
  ],
  ...overrides,
})

const makeLocalSnapshot = (title: string, label: string) =>
  makeBoardSnapshot({
    title,
    tiers: [
      makeTier({
        id: 'tier-s',
        itemIds: [asItemId('item-local')],
      }),
    ],
    items: {
      [asItemId('item-local')]: makeItem({
        id: asItemId('item-local'),
        label,
      }),
    },
  })

const seedRegistry = (
  boards: readonly { id: BoardId; title: string }[],
  activeBoardId: BoardId | null
): void =>
{
  useWorkspaceBoardRegistryStore.setState({
    boards: boards.map((board, index) => ({
      id: board.id,
      title: board.title,
      createdAt: index + 1,
    })),
    activeBoardId,
  })
}

const resetStores = (): void =>
{
  seedRegistry([], null)
  useActiveBoardStore
    .getState()
    .loadBoard(createInitialBoardData('classic'), EMPTY_BOARD_SYNC_STATE)
}

describe('activateCloudBoardAsActive', () =>
{
  beforeEach(() =>
  {
    resetStores()
  })

  it('refreshes a clean materialized cloud board before switching to it', async () =>
  {
    const staleSnapshot = makeLocalSnapshot('Stale local', 'Old item')
    const otherSnapshot = makeLocalSnapshot('Other board', 'Other item')
    saveBoardToStorage(CLOUD_BOARD_ID, staleSnapshot, {
      syncState: markBoardSynced(1, CLOUD_BOARD_EXTERNAL_ID),
    })
    saveBoardToStorage(OTHER_BOARD_ID, otherSnapshot)
    seedRegistry(
      [
        { id: OTHER_BOARD_ID, title: otherSnapshot.title },
        { id: CLOUD_BOARD_ID, title: staleSnapshot.title },
      ],
      OTHER_BOARD_ID
    )
    useActiveBoardStore.getState().loadBoard(otherSnapshot)
    getCloudStateMock.mockResolvedValue(
      makeCloudState({
        title: 'Fresh cloud',
        revision: 2,
      })
    )

    await activateCloudBoardAsActive(CLOUD_BOARD_EXTERNAL_ID)

    const state = useActiveBoardStore.getState()
    expect(getCloudStateMock).toHaveBeenCalledWith({
      boardExternalId: CLOUD_BOARD_EXTERNAL_ID,
    })
    expect(useWorkspaceBoardRegistryStore.getState().activeBoardId).toBe(
      CLOUD_BOARD_ID
    )
    expect(state.title).toBe('Fresh cloud')
    expect(state.items[asItemId('item-cloud')]?.label).toBe('Fresh item')
    expect(state.lastSyncedRevision).toBe(2)
    expect(state.pendingSyncAt).toBeNull()
    expect(
      useWorkspaceBoardRegistryStore
        .getState()
        .boards.find((board) => board.id === CLOUD_BOARD_ID)?.title
    ).toBe('Fresh cloud')
  })

  it('refreshes a clean materialized cloud board when it is already active', async () =>
  {
    const staleSnapshot = makeLocalSnapshot('Stale active', 'Old active item')
    const cleanSyncState = markBoardSynced(1, CLOUD_BOARD_EXTERNAL_ID)
    saveBoardToStorage(CLOUD_BOARD_ID, staleSnapshot, {
      syncState: cleanSyncState,
    })
    seedRegistry(
      [{ id: CLOUD_BOARD_ID, title: staleSnapshot.title }],
      CLOUD_BOARD_ID
    )
    useActiveBoardStore.getState().loadBoard(staleSnapshot, cleanSyncState)
    getCloudStateMock.mockResolvedValue(
      makeCloudState({
        title: 'Fresh active',
        revision: 3,
        items: [
          {
            externalId: 'item-cloud',
            tierId: 'tier-s',
            label: 'Fresh active item',
            mediaExternalId: null,
            order: 0,
            deletedAt: null,
          },
        ],
      })
    )

    await activateCloudBoardAsActive(CLOUD_BOARD_EXTERNAL_ID)

    const state = useActiveBoardStore.getState()
    expect(getCloudStateMock).toHaveBeenCalledOnce()
    expect(useWorkspaceBoardRegistryStore.getState().activeBoardId).toBe(
      CLOUD_BOARD_ID
    )
    expect(state.title).toBe('Fresh active')
    expect(state.items[asItemId('item-cloud')]?.label).toBe('Fresh active item')
    expect(state.lastSyncedRevision).toBe(3)
  })

  it('keeps the local snapshot when a materialized cloud board has pending edits', async () =>
  {
    const pendingSnapshot = makeLocalSnapshot('Pending local', 'Unsynced item')
    const otherSnapshot = makeLocalSnapshot('Other board', 'Other item')
    saveBoardToStorage(CLOUD_BOARD_ID, pendingSnapshot, {
      syncState: {
        ...markBoardSynced(1, CLOUD_BOARD_EXTERNAL_ID),
        pendingSyncAt: 123,
        pendingSyncOwnerUserId: 'user-a',
      },
    })
    saveBoardToStorage(OTHER_BOARD_ID, otherSnapshot)
    seedRegistry(
      [
        { id: OTHER_BOARD_ID, title: otherSnapshot.title },
        { id: CLOUD_BOARD_ID, title: pendingSnapshot.title },
      ],
      OTHER_BOARD_ID
    )
    useActiveBoardStore.getState().loadBoard(otherSnapshot)
    getCloudStateMock.mockResolvedValue(makeCloudState())

    await activateCloudBoardAsActive(CLOUD_BOARD_EXTERNAL_ID)

    const state = useActiveBoardStore.getState()
    const persisted = loadBoardFromStorage(CLOUD_BOARD_ID)
    expect(getCloudStateMock).not.toHaveBeenCalled()
    expect(useWorkspaceBoardRegistryStore.getState().activeBoardId).toBe(
      CLOUD_BOARD_ID
    )
    expect(state.title).toBe('Pending local')
    expect(state.items[asItemId('item-local')]?.label).toBe('Unsynced item')
    expect(state.pendingSyncAt).toBe(123)
    expect(persisted.sync.pendingSyncAt).toBe(123)
  })
})
