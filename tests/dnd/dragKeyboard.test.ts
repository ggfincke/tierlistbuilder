// tests/dnd/dragKeyboard.test.ts
// keyboard drag target helpers

import { describe, it, expect } from 'vitest'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '~/features/workspace/boards/dnd/dragKeyboard'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { findTierById, makeContainerSnapshot } from '../fixtures'

describe('resolveNextKeyboardDragPreview', () =>
{
  it('handles horizontal moves, vertical tier crossings, & null at boundaries', () =>
  {
    const snap = makeContainerSnapshot()

    const left = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-2'),
      direction: 'ArrowLeft',
    })
    expect(findTierById(left!.nextPreview.tiers, 'tier-s').itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])

    const right = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-2'),
      direction: 'ArrowRight',
    })
    expect(findTierById(right!.nextPreview.tiers, 'tier-s').itemIds).toEqual([
      'item-1',
      'item-3',
      'item-2',
    ])

    const down = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-1'),
      direction: 'ArrowDown',
    })
    expect(down!.containerId).toBe('tier-a')
    expect(findTierById(down!.nextPreview.tiers, 'tier-a').itemIds).toContain(
      'item-1'
    )

    const fromUnranked = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-6'),
      direction: 'ArrowUp',
    })
    expect(fromUnranked!.nextPreview.unrankedItemIds).not.toContain('item-6')

    expect(
      resolveNextKeyboardDragPreview({
        snapshot: snap,
        itemId: asItemId('item-1'),
        direction: 'ArrowLeft',
      })
    ).toBeNull()
    expect(
      resolveNextKeyboardDragPreview({
        snapshot: snap,
        itemId: asItemId('item-3'),
        direction: 'ArrowRight',
      })
    ).toBeNull()
  })
})

describe('resolveNextKeyboardFocusItem', () =>
{
  it('moves to adjacent items & skips empty containers vertically', () =>
  {
    const snap = makeContainerSnapshot()
    expect(
      resolveNextKeyboardFocusItem({
        snapshot: snap,
        itemId: asItemId('item-1'),
        direction: 'ArrowRight',
      })
    ).toBe('item-2')
    // tier-b is empty, ArrowDown from tier-a goes to unranked
    expect(
      resolveNextKeyboardFocusItem({
        snapshot: snap,
        itemId: asItemId('item-4'),
        direction: 'ArrowDown',
      })
    ).toBe('item-6')
  })
})
