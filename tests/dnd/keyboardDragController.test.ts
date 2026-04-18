import { beforeEach, describe, expect, it } from 'vitest'

import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import {
  handleKeyboardArrowKey,
  handleKeyboardBoardJumpKey,
  handleKeyboardEscapeKey,
  handleKeyboardItemFocus,
  handleKeyboardSpaceKey,
} from '~/features/workspace/boards/interaction/keyboardDragController'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'

const makeBoard = (): BoardSnapshot => ({
  title: 'Keyboard Board',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      colorSpec: createPaletteTierColorSpec(0),
      itemIds: ['item-1', 'item-2'],
    },
    {
      id: 'tier-a',
      name: 'A',
      colorSpec: createPaletteTierColorSpec(1),
      itemIds: ['item-3'],
    },
  ],
  unrankedItemIds: ['item-4'],
  items: {
    'item-1': { id: 'item-1', label: 'One', backgroundColor: '#111111' },
    'item-2': { id: 'item-2', label: 'Two', backgroundColor: '#222222' },
    'item-3': { id: 'item-3', label: 'Three', backgroundColor: '#333333' },
    'item-4': { id: 'item-4', label: 'Four', backgroundColor: '#444444' },
  },
  deletedItems: [],
})

beforeEach(() =>
{
  useActiveBoardStore.getState().loadBoard(makeBoard())
})

describe('keyboard drag controller', () =>
{
  it('enters browse mode when an item receives focus', () =>
  {
    handleKeyboardItemFocus('item-2')

    const state = useActiveBoardStore.getState()

    expect(state.keyboardMode).toBe('browse')
    expect(state.keyboardFocusItemId).toBe('item-2')
  })

  it('picks up a focused item from Space', () =>
  {
    handleKeyboardItemFocus('item-1')
    handleKeyboardSpaceKey('item-1')

    const state = useActiveBoardStore.getState()

    expect(state.keyboardMode).toBe('dragging')
    expect(state.activeItemId).toBe('item-1')
    expect(state.dragPreview).not.toBeNull()
  })

  it('jumps back to the last active board item', () =>
  {
    useActiveBoardStore.setState({ lastClickedItemId: 'item-4' })

    handleKeyboardBoardJumpKey()

    const state = useActiveBoardStore.getState()

    expect(state.keyboardMode).toBe('browse')
    expect(state.keyboardFocusItemId).toBe('item-4')
  })

  it('uses the previous spatial arrow focus behavior in browse mode', () =>
  {
    handleKeyboardItemFocus('item-1')
    handleKeyboardArrowKey('item-1', 'ArrowDown')

    const state = useActiveBoardStore.getState()

    expect(state.keyboardMode).toBe('browse')
    expect(state.keyboardFocusItemId).toBe('item-3')
  })

  it('moves an item across tiers and drops it with Space', () =>
  {
    handleKeyboardItemFocus('item-1')
    handleKeyboardSpaceKey('item-1')
    handleKeyboardArrowKey('item-1', 'ArrowDown')
    handleKeyboardSpaceKey('item-1')

    const state = useActiveBoardStore.getState()

    expect(state.keyboardMode).toBe('browse')
    expect(state.activeItemId).toBeNull()
    expect(state.dragPreview).toBeNull()
    expect(state.keyboardFocusItemId).toBe('item-1')
    expect(state.tiers[0].itemIds).toEqual(['item-2'])
    expect(state.tiers[1].itemIds).toEqual(['item-1', 'item-3'])
  })

  it('clears selection before leaving browse state on Escape', () =>
  {
    useActiveBoardStore.getState().selectAll()
    handleKeyboardItemFocus('item-4')
    handleKeyboardEscapeKey('item-4')

    const state = useActiveBoardStore.getState()

    expect(state.keyboardMode).toBe('browse')
    expect(state.keyboardFocusItemId).toBe('item-4')
    expect(state.selection.ids).toEqual([])
  })
})
