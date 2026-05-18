// tests/dnd/keyboardDragController.test.ts
// keyboard drag controller state-machine

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
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'

const makeBoard = (): BoardSnapshot =>
  makeBoardSnapshot({
    title: 'Keyboard Board',
    tiers: [
      makeTier({
        id: 'tier-s',
        name: 'S',
        itemIds: [asItemId('item-1'), asItemId('item-2')],
      }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        colorSpec: createPaletteTierColorSpec(1),
        itemIds: [asItemId('item-3')],
      }),
    ],
    unrankedItemIds: [asItemId('item-4')],
    items: {
      [asItemId('item-1')]: makeItem({ id: asItemId('item-1'), label: 'One' }),
      [asItemId('item-2')]: makeItem({ id: asItemId('item-2'), label: 'Two' }),
      [asItemId('item-3')]: makeItem({
        id: asItemId('item-3'),
        label: 'Three',
      }),
      [asItemId('item-4')]: makeItem({ id: asItemId('item-4'), label: 'Four' }),
    },
  })

beforeEach(() =>
{
  useActiveBoardStore.getState().loadBoard(makeBoard())
})

describe('keyboard drag controller', () =>
{
  it('Space picks up, Arrow moves across tiers, Space drops, focus restored', () =>
  {
    handleKeyboardItemFocus('item-1')
    expect(useActiveBoardStore.getState().keyboardMode).toBe('browse')

    handleKeyboardSpaceKey('item-1')
    expect(useActiveBoardStore.getState()).toMatchObject({
      keyboardMode: 'dragging',
      activeItemId: 'item-1',
    })

    handleKeyboardArrowKey('item-1', 'ArrowDown')
    handleKeyboardSpaceKey('item-1')

    const state = useActiveBoardStore.getState()
    expect(state).toMatchObject({
      keyboardMode: 'browse',
      activeItemId: null,
      dragPreview: null,
      keyboardFocusItemId: 'item-1',
    })
    expect(state.tiers[0].itemIds).toEqual(['item-2'])
    expect(state.tiers[1].itemIds).toEqual(['item-1', 'item-3'])
  })

  it('Arrow in browse mode moves spatial focus across tiers', () =>
  {
    handleKeyboardItemFocus('item-1')
    handleKeyboardArrowKey('item-1', 'ArrowDown')
    expect(useActiveBoardStore.getState()).toMatchObject({
      keyboardMode: 'browse',
      keyboardFocusItemId: 'item-3',
    })
  })

  it('board-jump returns focus to the last clicked item', () =>
  {
    useActiveBoardStore.setState({ lastClickedItemId: 'item-4' })
    handleKeyboardBoardJumpKey()
    expect(useActiveBoardStore.getState().keyboardFocusItemId).toBe('item-4')
  })

  it('Escape clears selection before leaving browse state', () =>
  {
    useActiveBoardStore.getState().selectAll()
    handleKeyboardItemFocus('item-4')
    handleKeyboardEscapeKey('item-4')

    expect(useActiveBoardStore.getState()).toMatchObject({
      keyboardMode: 'browse',
      keyboardFocusItemId: 'item-4',
    })
    expect(useActiveBoardStore.getState().selection.ids).toEqual([])
  })
})
