import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'

const makeBoard = (title: string): BoardSnapshot => ({
  title,
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      colorSpec: createPaletteTierColorSpec(0),
      itemIds: [],
    },
  ],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

const resetStore = () =>
{
  useActiveBoardStore.setState({
    ...makeBoard('Initial'),
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
    lastSyncedRevision: 5,
    cloudBoardExternalId: 'cloud-board-5',
    pendingSyncAt: null,
  })
}

describe('active board sync state', () =>
{
  beforeEach(resetStore)
  afterEach(resetStore)

  it('preserves sync metadata when resetting a board', () =>
  {
    useActiveBoardStore.getState().resetBoard('classic')

    const state = useActiveBoardStore.getState()
    expect(state.lastSyncedRevision).toBe(5)
    expect(state.cloudBoardExternalId).toBe('cloud-board-5')
  })

  it('hydrates sync metadata when loading a board into the active store', () =>
  {
    useActiveBoardStore.getState().loadBoard(makeBoard('Loaded'), {
      lastSyncedRevision: 9,
      cloudBoardExternalId: 'cloud-board-9',
      pendingSyncAt: null,
    })

    const state = useActiveBoardStore.getState()
    expect(state.title).toBe('Loaded')
    expect(state.lastSyncedRevision).toBe(9)
    expect(state.cloudBoardExternalId).toBe('cloud-board-9')
  })
})
