// tests/undoLabels.test.ts
// undo/redo label tracking — parallel array length invariant & round-trip labels

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { createPaletteTierColorSpec } from '@/shared/theme/tierColors'

const resetStore = () =>
{
  useActiveBoardStore.setState({
    title: 'Test',
    tiers: [
      {
        id: 't-1',
        name: 'S',
        colorSpec: createPaletteTierColorSpec(0),
        itemIds: [],
      },
    ],
    unrankedItemIds: [],
    items: {},
    deletedItems: [],
    past: [],
    pastLabels: [],
    future: [],
    futureLabels: [],
    activeItemId: null,
    dragPreview: null,
    dragGroupIds: [],
    keyboardMode: 'idle',
    keyboardFocusItemId: null,
    selectedItemIds: [],
    selectedItemIdSet: new Set(),
    lastClickedItemId: null,
    itemsManuallyMoved: false,
    runtimeError: null,
  })
}

describe('undo labels', () =>
{
  beforeEach(() =>
  {
    resetStore()
  })

  afterEach(() =>
  {
    resetStore()
  })

  it('keeps past/pastLabels & future/futureLabels length-synced', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addTier('classic')
    store.addTier('classic')

    const state = useActiveBoardStore.getState()
    expect(state.past.length).toBe(state.pastLabels.length)
    expect(state.future.length).toBe(state.futureLabels.length)
    expect(state.pastLabels).toEqual(['Add tier', 'Add tier'])
  })

  it('returns the label of the undone action', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addTier('classic')
    store.addTextItem('Hello', '#fff')

    const result = useActiveBoardStore.getState().undo()
    expect(result).toEqual({ label: 'Add item' })
  })

  it('returns the label of the redone action', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addTier('classic')
    store.addTextItem('Hello', '#fff')
    useActiveBoardStore.getState().undo()

    const result = useActiveBoardStore.getState().redo()
    expect(result).toEqual({ label: 'Add item' })
  })

  it('returns null when undo/redo stacks are empty', () =>
  {
    const state = useActiveBoardStore.getState()
    expect(state.undo()).toBeNull()
    expect(state.redo()).toBeNull()
  })

  it('moves the label from past to future on undo', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addTier('classic')

    const before = useActiveBoardStore.getState()
    expect(before.pastLabels).toEqual(['Add tier'])
    expect(before.futureLabels).toEqual([])

    before.undo()

    const after = useActiveBoardStore.getState()
    expect(after.pastLabels).toEqual([])
    expect(after.futureLabels).toEqual(['Add tier'])
  })

  it('labels pluralize for bulk item adds', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addItems([
      { label: 'a', backgroundColor: '#000' },
      { label: 'b', backgroundColor: '#000' },
      { label: 'c', backgroundColor: '#000' },
    ])

    expect(useActiveBoardStore.getState().pastLabels).toEqual(['Add 3 items'])
  })

  it('clears future stack on new action', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addTier('classic')
    store.addTier('classic')
    useActiveBoardStore.getState().undo()

    expect(useActiveBoardStore.getState().future.length).toBe(1)

    useActiveBoardStore.getState().addTier('classic')
    const state = useActiveBoardStore.getState()

    expect(state.future).toEqual([])
    expect(state.futureLabels).toEqual([])
  })
})
