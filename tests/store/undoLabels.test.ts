// tests/store/undoLabels.test.ts
// undo/redo label tracking — UndoEntry snapshot/label pairing & round-trip labels

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'

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

  it('records labels on past entries in order', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addTier('classic')
    store.addTier('classic')

    const state = useActiveBoardStore.getState()
    expect(state.past.map((entry) => entry.label)).toEqual([
      'Add tier',
      'Add tier',
    ])
    expect(state.future).toEqual([])
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
    expect(before.past.map((entry) => entry.label)).toEqual(['Add tier'])
    expect(before.future).toEqual([])

    before.undo()

    const after = useActiveBoardStore.getState()
    expect(after.past).toEqual([])
    expect(after.future.map((entry) => entry.label)).toEqual(['Add tier'])
  })

  it('labels pluralize for bulk item adds', () =>
  {
    const store = useActiveBoardStore.getState()
    store.addItems([
      { label: 'a', backgroundColor: '#000' },
      { label: 'b', backgroundColor: '#000' },
      { label: 'c', backgroundColor: '#000' },
    ])

    expect(
      useActiveBoardStore.getState().past.map((entry) => entry.label)
    ).toEqual(['Add 3 items'])
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
  })
})
