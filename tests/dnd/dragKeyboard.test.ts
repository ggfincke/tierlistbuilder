// tests/dnd/dragKeyboard.test.ts
// keyboard drag target helpers

import { describe, it, expect } from 'vitest'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '~/features/workspace/boards/dnd/dragKeyboard'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { findTierById, makeSnapshot } from '../fixtures'

describe('resolveNextKeyboardDragPreview', () =>
{
  it('ArrowLeft from middle moves item one position left', () =>
  {
    const snap = makeSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-2'),
      direction: 'ArrowLeft',
    })
    expect(result).not.toBeNull()
    const tierS = findTierById(result!.nextPreview.tiers, 'tier-s')
    expect(tierS.itemIds).toEqual(['item-2', 'item-1', 'item-3'])
  })

  it('ArrowLeft from first position returns null', () =>
  {
    const snap = makeSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-1'),
      direction: 'ArrowLeft',
    })
    expect(result).toBeNull()
  })

  it('ArrowRight from middle moves item one position right', () =>
  {
    const snap = makeSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-2'),
      direction: 'ArrowRight',
    })
    expect(result).not.toBeNull()
    const tierS = findTierById(result!.nextPreview.tiers, 'tier-s')
    expect(tierS.itemIds).toEqual(['item-1', 'item-3', 'item-2'])
  })

  it('ArrowRight from last position returns null', () =>
  {
    const snap = makeSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-3'),
      direction: 'ArrowRight',
    })
    expect(result).toBeNull()
  })

  it('ArrowDown moves item to the next tier below', () =>
  {
    const snap = makeSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-1'),
      direction: 'ArrowDown',
    })
    expect(result).not.toBeNull()
    expect(result!.containerId).toBe('tier-a')
    const tierS = findTierById(result!.nextPreview.tiers, 'tier-s')
    expect(tierS.itemIds).not.toContain('item-1')
    const tierA = findTierById(result!.nextPreview.tiers, 'tier-a')
    expect(tierA.itemIds).toContain('item-1')
  })

  it('ArrowUp from unranked moves item to the last tier', () =>
  {
    const snap = makeSnapshot()
    const result = resolveNextKeyboardDragPreview({
      snapshot: snap,
      itemId: asItemId('item-6'),
      direction: 'ArrowUp',
    })
    expect(result).not.toBeNull()
    expect(result!.containerId).toBe('tier-b')
    expect(result!.nextPreview.unrankedItemIds).not.toContain('item-6')
  })
})

describe('resolveNextKeyboardFocusItem', () =>
{
  it('ArrowRight returns the adjacent item in the same container', () =>
  {
    const snap = makeSnapshot()
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
    const snap = makeSnapshot()
    const result = resolveNextKeyboardFocusItem({
      snapshot: snap,
      itemId: asItemId('item-4'),
      direction: 'ArrowDown',
    })
    expect(result).toBe('item-6')
  })
})
