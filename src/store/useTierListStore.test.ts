import { beforeEach, describe, expect, it } from 'vitest'

import type { TierListData } from '../types'
import { createContainerSnapshot, moveItemInSnapshot } from '../utils/dragInsertion'
import { useTierListStore } from './useTierListStore'

const createBoardData = (): TierListData => ({
  title: 'Test Board',
  tiers: [
    {
      id: 'tier-a',
      name: 'A',
      color: '#ff7f7f',
      itemIds: ['item-1', 'item-2', 'item-3'],
    },
    {
      id: 'tier-b',
      name: 'B',
      color: '#ffbf7f',
      itemIds: ['item-4'],
    },
  ],
  unrankedItemIds: ['item-5', 'item-6'],
  items: {
    'item-1': { id: 'item-1', imageUrl: 'one.png', label: 'One' },
    'item-2': { id: 'item-2', imageUrl: 'two.png', label: 'Two' },
    'item-3': { id: 'item-3', imageUrl: 'three.png', label: 'Three' },
    'item-4': { id: 'item-4', imageUrl: 'four.png', label: 'Four' },
    'item-5': { id: 'item-5', imageUrl: 'five.png', label: 'Five' },
    'item-6': { id: 'item-6', imageUrl: 'six.png', label: 'Six' },
  },
})

const resetStore = () => {
  useTierListStore.setState({
    ...createBoardData(),
    activeItemId: null,
    dragPreview: null,
    runtimeError: null,
  })
}

describe('useTierListStore drag preview lifecycle', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      configurable: true,
    })

    resetStore()
  })

  it('initializes dragPreview from the persisted board order on drag start', () => {
    const store = useTierListStore.getState()

    store.beginDragPreview()

    expect(useTierListStore.getState().dragPreview).toEqual(createContainerSnapshot(createBoardData()))
    expect(useTierListStore.getState().tiers[0].itemIds).toEqual(['item-1', 'item-2', 'item-3'])
    expect(useTierListStore.getState().unrankedItemIds).toEqual(['item-5', 'item-6'])
  })

  it('updates only dragPreview during hover moves and leaves persisted order untouched', () => {
    const store = useTierListStore.getState()

    store.beginDragPreview()
    store.updateDragPreview(
      moveItemInSnapshot(createContainerSnapshot(useTierListStore.getState()), 'item-1', 'tier-a', 'tier-a', 2),
    )

    expect(useTierListStore.getState().dragPreview?.tiers[0].itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])
    expect(useTierListStore.getState().tiers[0].itemIds).toEqual(['item-1', 'item-2', 'item-3'])
  })

  it('commits the exact preview snapshot into persisted board order on drop', () => {
    const store = useTierListStore.getState()

    store.beginDragPreview()
    store.updateDragPreview(
      moveItemInSnapshot(createContainerSnapshot(useTierListStore.getState()), 'item-2', 'tier-a', 'tier-b', 1),
    )

    const previewBeforeCommit = useTierListStore.getState().dragPreview
    expect(previewBeforeCommit).not.toBeNull()

    store.commitDragPreview()

    expect(useTierListStore.getState().dragPreview).toBeNull()
    expect(createContainerSnapshot(useTierListStore.getState())).toEqual(previewBeforeCommit)
  })

  it('discards dragPreview on cancel and leaves persisted board order unchanged', () => {
    const store = useTierListStore.getState()
    const persistedBeforeDrag = createContainerSnapshot(useTierListStore.getState())

    store.beginDragPreview()
    store.updateDragPreview(
      moveItemInSnapshot(createContainerSnapshot(useTierListStore.getState()), 'item-3', 'tier-a', 'tier-a', 0),
    )
    store.discardDragPreview()

    expect(useTierListStore.getState().dragPreview).toBeNull()
    expect(createContainerSnapshot(useTierListStore.getState())).toEqual(persistedBeforeDrag)
  })

  it('discards dragPreview for outside-drop flows and leaves persisted board order unchanged', () => {
    const store = useTierListStore.getState()
    const persistedBeforeDrag = createContainerSnapshot(useTierListStore.getState())

    store.beginDragPreview()
    store.updateDragPreview(
      moveItemInSnapshot(createContainerSnapshot(useTierListStore.getState()), 'item-2', 'tier-a', 'tier-b', 1),
    )
    store.discardDragPreview()

    expect(useTierListStore.getState().dragPreview).toBeNull()
    expect(createContainerSnapshot(useTierListStore.getState())).toEqual(persistedBeforeDrag)
  })

  it('preserves hover/drop parity for the immediate right-neighbor swap case', () => {
    const store = useTierListStore.getState()

    store.beginDragPreview()
    store.updateDragPreview(
      moveItemInSnapshot(createContainerSnapshot(useTierListStore.getState()), 'item-1', 'tier-a', 'tier-a', 2),
    )

    const lastPreview = useTierListStore.getState().dragPreview
    expect(lastPreview?.tiers[0].itemIds).toEqual(['item-2', 'item-1', 'item-3'])

    store.commitDragPreview()

    expect(createContainerSnapshot(useTierListStore.getState())).toEqual(lastPreview)
    expect(useTierListStore.getState().tiers[0].itemIds).toEqual(['item-2', 'item-1', 'item-3'])
  })
})
