// tests/dnd/dragLayoutRows.test.ts
// pure visual row layout helpers for drag navigation

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  buildRenderedRowLayout,
  isPointerInTrailingLastRowSpace,
  resolveColumnAwareCrossContainerIndexFromLayouts,
  resolveIntraContainerRowMoveFromLayout,
} from '~/features/workspace/boards/dnd/dragLayoutRows'
import { brandItemIds as ids, makeRect } from '../fixtures'

describe('buildRenderedRowLayout', () =>
{
  it('sorts items by visual row then horizontal position', () =>
  {
    const layout = buildRenderedRowLayout([
      { itemId: asItemId('item-b'), left: 100, top: 10 },
      { itemId: asItemId('item-c'), left: 0, top: 70 },
      { itemId: asItemId('item-a'), left: 0, top: 12 },
    ])

    expect(layout?.rows).toEqual([['item-a', 'item-b'], ['item-c']])
  })
})

describe('resolveIntraContainerRowMoveFromLayout', () =>
{
  it('preserves column when moving between rows in one container', () =>
  {
    const layout = {
      rows: [ids('item-a', 'item-b'), ids('item-c')],
      rowCount: 2,
    }

    const result = resolveIntraContainerRowMoveFromLayout(
      layout,
      asItemId('item-b'),
      'ArrowDown',
      ids('item-a', 'item-b', 'item-c')
    )

    expect(result).toEqual({ targetIndex: 2, targetItemId: 'item-c' })
  })
})

describe('resolveColumnAwareCrossContainerIndexFromLayouts', () =>
{
  it('uses the source column in the target edge row', () =>
  {
    const sourceLayout = {
      rows: [ids('item-a', 'item-b')],
      rowCount: 1,
    }
    const targetLayout = {
      rows: [ids('item-c'), ids('item-d', 'item-e')],
      rowCount: 2,
    }

    const result = resolveColumnAwareCrossContainerIndexFromLayouts(
      sourceLayout,
      targetLayout,
      asItemId('item-b'),
      ids('item-c', 'item-d', 'item-e'),
      'ArrowUp'
    )

    expect(result).toEqual({ targetIndex: 2, targetItemId: 'item-e' })
  })
})

describe('isPointerInTrailingLastRowSpace', () =>
{
  it('detects pointer space after the rightmost item in the final row', () =>
  {
    const itemRects = [
      makeRect({ left: 0, top: 0, width: 50, height: 50 }),
      makeRect({ left: 0, top: 60, width: 50, height: 50 }),
      makeRect({ left: 60, top: 60, width: 50, height: 50 }),
    ]

    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 120, y: 80 },
        itemRects,
      })
    ).toBe(true)
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 100, y: 80 },
        itemRects,
      })
    ).toBe(false)
  })
})
