// tests/dnd/dragKeyboard.test.ts
// keyboard drag target helpers

import { describe, it, expect } from 'vitest'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '~/features/workspace/boards/dnd/dragKeyboard'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { findTierById, makeContainerSnapshot } from '@tests/fixtures'

describe('resolveNextKeyboardDragPreview', () =>
{
  it('shifts within a tier on ArrowLeft/Right & returns null at the edges', () =>
  {
    const snap = makeContainerSnapshot()

    const left = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-2'),
      direction: 'ArrowLeft',
    })
    expect(left).not.toBeNull()
    if (left)
    {
      const tierS = findTierById(left.nextPreview.tiers, 'tier-s')
      expect(tierS.itemIds).toEqual(['item-2', 'item-1', 'item-3'])
    }

    const right = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-2'),
      direction: 'ArrowRight',
    })
    expect(right).not.toBeNull()
    if (right)
    {
      const tierS = findTierById(right.nextPreview.tiers, 'tier-s')
      expect(tierS.itemIds).toEqual(['item-1', 'item-3', 'item-2'])
    }

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

  it('ArrowDown moves item to the next tier below', () =>
  {
    const snap = makeContainerSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-1'),
      direction: 'ArrowDown',
    })
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.containerId).toBe('tier-a')
    const tierS = findTierById(result.nextPreview.tiers, 'tier-s')
    expect(tierS.itemIds).not.toContain('item-1')
    const tierA = findTierById(result.nextPreview.tiers, 'tier-a')
    expect(tierA.itemIds).toContain('item-1')
  })

  it('ArrowUp from unranked moves item to the last tier', () =>
  {
    const snap = makeContainerSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-6'),
      direction: 'ArrowUp',
    })
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.containerId).toBe('tier-b')
    expect(result.nextPreview.unrankedItemIds).not.toContain('item-6')
  })
})

describe('resolveNextKeyboardFocusItem', () =>
{
  it('ArrowRight returns the adjacent item in the same container', () =>
  {
    const snap = makeContainerSnapshot()
    const result = resolveNextKeyboardFocusItem({
      snapshot: snap,
      itemId: asItemId('item-1'),
      direction: 'ArrowRight',
    })
    expect(result).toBe('item-2')
  })

  it('ArrowDown skips empty containers & focuses item in next non-empty one', () =>
  {
    // tier-b is empty, so ArrowDown from tier-a should go to unranked
    const snap = makeContainerSnapshot()
    const result = resolveNextKeyboardFocusItem({
      snapshot: snap,
      itemId: asItemId('item-4'),
      direction: 'ArrowDown',
    })
    expect(result).toBe('item-6')
  })
})
