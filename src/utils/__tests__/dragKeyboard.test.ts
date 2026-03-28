// src/utils/__tests__/dragKeyboard.test.ts
// unit tests for keyboard-driven preview movement & focus resolution

import { describe, expect, it } from 'vitest'

import type { ContainerSnapshot } from '../../types'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '../dragKeyboard'

const snapshot: ContainerSnapshot = {
  tiers: [
    { id: 'tier-a', itemIds: ['a1', 'a2'] },
    { id: 'tier-b', itemIds: ['b1'] },
    { id: 'tier-c', itemIds: [] },
  ],
  unrankedItemIds: ['u1', 'u2'],
}

describe('resolveNextKeyboardDragPreview', () =>
{
  it('moves left & right within the same container when possible', () =>
  {
    const moveLeft = resolveNextKeyboardDragPreview({
      snapshot,
      itemId: 'a2',
      direction: 'ArrowLeft',
    })

    expect(moveLeft?.containerId).toBe('tier-a')
    expect(moveLeft?.nextPreview.tiers[0].itemIds).toEqual(['a2', 'a1'])

    expect(
      resolveNextKeyboardDragPreview({
        snapshot,
        itemId: 'a2',
        direction: 'ArrowRight',
      })
    ).toBeNull()
  })

  it('moves vertically to the adjacent container while preserving column intent', () =>
  {
    const moveDown = resolveNextKeyboardDragPreview({
      snapshot,
      itemId: 'a2',
      direction: 'ArrowDown',
    })

    expect(moveDown?.containerId).toBe('tier-b')
    expect(moveDown?.nextPreview.tiers[0].itemIds).toEqual(['a1'])
    expect(moveDown?.nextPreview.tiers[1].itemIds).toEqual(['b1', 'a2'])
  })

  it('can append explicitly to the end of the target container', () =>
  {
    const moveDown = resolveNextKeyboardDragPreview({
      snapshot,
      itemId: 'a1',
      direction: 'ArrowDown',
      appendToTargetEnd: true,
    })

    expect(moveDown?.nextPreview.tiers[1].itemIds).toEqual(['b1', 'a1'])
  })

  it('returns null when the item cannot move beyond the edge containers', () =>
  {
    expect(
      resolveNextKeyboardDragPreview({
        snapshot,
        itemId: 'a1',
        direction: 'ArrowUp',
      })
    ).toBeNull()

    expect(
      resolveNextKeyboardDragPreview({
        snapshot,
        itemId: 'u2',
        direction: 'ArrowDown',
      })
    ).toBeNull()
  })
})

describe('resolveNextKeyboardFocusItem', () =>
{
  it('moves horizontal focus to neighboring items', () =>
  {
    expect(
      resolveNextKeyboardFocusItem({
        snapshot,
        itemId: 'a1',
        direction: 'ArrowRight',
      })
    ).toBe('a2')

    expect(
      resolveNextKeyboardFocusItem({
        snapshot,
        itemId: 'a1',
        direction: 'ArrowLeft',
      })
    ).toBeNull()
  })

  it('skips empty containers when moving vertical focus', () =>
  {
    expect(
      resolveNextKeyboardFocusItem({
        snapshot,
        itemId: 'b1',
        direction: 'ArrowDown',
      })
    ).toBe('u1')

    expect(
      resolveNextKeyboardFocusItem({
        snapshot,
        itemId: 'u2',
        direction: 'ArrowUp',
      })
    ).toBe('b1')
  })
})
