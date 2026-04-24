// tests/store/undoLabels.test.ts
// undo/redo label tracking — UndoEntry snapshot/label pairing & round-trip labels

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeItem, makeTier } from '../fixtures'

const resetStore = () =>
{
  useActiveBoardStore.setState({
    title: 'Test',
    tiers: [makeTier({ id: 'tier-1', name: 'S' })],
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

  it('removes multiple items through one undo entry', () =>
  {
    const firstId = asItemId('item-1')
    const secondId = asItemId('item-2')
    const keptId = asItemId('item-3')
    const deletedId = asItemId('deleted-1')
    const first = makeItem({ id: firstId, label: 'First' })
    const second = makeItem({ id: secondId, label: 'Second' })
    const kept = makeItem({ id: keptId, label: 'Kept' })
    const alreadyDeleted = makeItem({ id: deletedId, label: 'Deleted' })

    useActiveBoardStore.setState({
      tiers: [makeTier({ id: 'tier-1', itemIds: [firstId, secondId] })],
      unrankedItemIds: [keptId],
      items: {
        [firstId]: first,
        [secondId]: second,
        [keptId]: kept,
      },
      deletedItems: [alreadyDeleted],
      activeItemId: firstId,
      keyboardFocusItemId: secondId,
      keyboardMode: 'dragging',
      selection: {
        ids: [firstId, secondId],
        set: new Set([firstId, secondId]),
      },
      lastClickedItemId: secondId,
    })

    useActiveBoardStore.getState().removeItems([firstId, secondId])

    const removed = useActiveBoardStore.getState()
    expect(removed.tiers[0].itemIds).toEqual([])
    expect(removed.unrankedItemIds).toEqual([keptId])
    expect(removed.items).toEqual({ [keptId]: kept })
    expect(removed.deletedItems).toEqual([first, second, alreadyDeleted])
    expect(removed.past.map((entry) => entry.label)).toEqual(['Delete 2 items'])
    expect(removed.activeItemId).toBeNull()
    expect(removed.keyboardFocusItemId).toBeNull()
    expect(removed.keyboardMode).toBe('idle')
    expect(removed.selection.ids).toEqual([])
    expect(removed.lastClickedItemId).toBeNull()

    expect(removed.undo()).toEqual({ label: 'Delete 2 items' })

    const restored = useActiveBoardStore.getState()
    expect(restored.tiers[0].itemIds).toEqual([firstId, secondId])
    expect(restored.items).toEqual({
      [firstId]: first,
      [secondId]: second,
      [keptId]: kept,
    })
    expect(restored.deletedItems).toEqual([alreadyDeleted])
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
