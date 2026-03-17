// src/utils/dragInsertion.test.ts
// unit tests for drag insertion logic

import { describe, expect, it } from 'vitest'

import type { ContainerSnapshot } from '../types'
import { UNRANKED_CONTAINER_ID } from './constants'
import {
  getDraggedItemRect,
  isPointerInTrailingLastRowSpace,
  moveItemInSnapshot,
  resolveNextDragPreview,
  resolveDragTargetIndex,
  resolveStoreInsertionIndex,
} from './dragInsertion'

const createRect = ({
  left,
  top = 0,
  width = 80,
  height = 80,
}: {
  left: number
  top?: number
  width?: number
  height?: number
}) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

const createSnapshot = (): ContainerSnapshot => ({
  tiers: [
    { id: 'tier-a', itemIds: ['item-1', 'item-2', 'item-3'] },
    { id: 'tier-b', itemIds: ['item-4'] },
  ],
  unrankedItemIds: ['item-5', 'item-6'],
})

describe('dragInsertion helpers', () =>
{
  it('rebuilds the dragged rect from the initial rect and drag delta', () =>
  {
    const translatedRect = createRect({ left: 150 })

    expect(
      getDraggedItemRect({
        translatedRect,
        initialRect: createRect({ left: 0 }),
        delta: { x: 5, y: 0 },
      })
    ).toEqual(translatedRect)

    expect(
      getDraggedItemRect({
        translatedRect: null,
        initialRect: createRect({ left: 20, top: 10 }),
        delta: { x: 50, y: 30 },
      })
    ).toEqual(createRect({ left: 70, top: 40 }))
  })

  it('resolves drag target indices for front, middle, and end hover positions', () =>
  {
    expect(
      resolveDragTargetIndex({
        draggedRect: createRect({ left: 15 }),
        overRect: createRect({ left: 100 }),
        overId: 'tier-a',
        overContainerId: 'tier-a',
        overIndex: -1,
        overItemsLength: 3,
      })
    ).toBe(3)

    expect(
      resolveDragTargetIndex({
        draggedRect: createRect({ left: 99 }),
        overRect: createRect({ left: 100 }),
        overId: 'item-1',
        overContainerId: 'tier-a',
        overIndex: 0,
        overItemsLength: 3,
      })
    ).toBe(0)

    expect(
      resolveDragTargetIndex({
        draggedRect: createRect({ left: 160 }),
        overRect: createRect({ left: 100 }),
        overId: 'item-2',
        overContainerId: 'tier-a',
        overIndex: 1,
        overItemsLength: 4,
      })
    ).toBe(2)

    expect(
      resolveDragTargetIndex({
        draggedRect: createRect({ left: 301 }),
        overRect: createRect({ left: 300 }),
        overId: 'item-4',
        overContainerId: 'tier-a',
        overIndex: 3,
        overItemsLength: 4,
      })
    ).toBe(4)
  })

  it('detects trailing space in the last rendered row of a single-row container', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 275, y: 40 },
        itemRects: [
          createRect({ left: 0 }),
          createRect({ left: 90 }),
          createRect({ left: 180 }),
        ],
      })
    ).toBe(true)
  })

  it('detects trailing space in the last rendered row of a wrapped container', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 175, y: 130 },
        itemRects: [
          createRect({ left: 0, top: 0 }),
          createRect({ left: 90, top: 0 }),
          createRect({ left: 180, top: 0 }),
          createRect({ left: 0, top: 90 }),
          createRect({ left: 90, top: 90 }),
        ],
      })
    ).toBe(true)
  })

  it('ignores blank space above a shorter last row', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 200, y: 40 },
        itemRects: [
          createRect({ left: 0, top: 0 }),
          createRect({ left: 90, top: 0 }),
          createRect({ left: 180, top: 0 }),
          createRect({ left: 0, top: 90 }),
        ],
      })
    ).toBe(false)
  })

  it('ignores blank space below the last row', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 175, y: 190 },
        itemRects: [
          createRect({ left: 0, top: 0 }),
          createRect({ left: 90, top: 0 }),
          createRect({ left: 180, top: 0 }),
          createRect({ left: 0, top: 90 }),
          createRect({ left: 90, top: 90 }),
        ],
      })
    ).toBe(false)
  })

  it('ignores trailing-space detection when pointer coordinates are unavailable', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: null,
        itemRects: [createRect({ left: 0 }), createRect({ left: 90 })],
      })
    ).toBe(false)
  })

  it('normalizes same-container insertion indices after removing the active item', () =>
  {
    expect(
      resolveStoreInsertionIndex({
        sameContainer: true,
        sourceIndex: 0,
        targetIndex: 2,
        targetItemsLength: 2,
      })
    ).toBe(1)

    expect(
      resolveStoreInsertionIndex({
        sameContainer: true,
        sourceIndex: 0,
        targetIndex: 3,
        targetItemsLength: 2,
      })
    ).toBe(2)

    expect(
      resolveStoreInsertionIndex({
        sameContainer: true,
        sourceIndex: 1,
        targetIndex: 1,
        targetItemsLength: 2,
      })
    ).toBe(1)

    expect(
      resolveStoreInsertionIndex({
        sameContainer: false,
        sourceIndex: 0,
        targetIndex: 2,
        targetItemsLength: 2,
      })
    ).toBe(2)
  })

  it('moves items left within a tier snapshot', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-3',
      'tier-a',
      'tier-a',
      1
    )

    expect(nextSnapshot.tiers[0].itemIds).toEqual([
      'item-1',
      'item-3',
      'item-2',
    ])
  })

  it('moves items right within a tier snapshot', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-1',
      'tier-a',
      'tier-a',
      3
    )

    expect(nextSnapshot.tiers[0].itemIds).toEqual([
      'item-2',
      'item-3',
      'item-1',
    ])
  })

  it('handles the immediate right-neighbor swap case within a tier', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-1',
      'tier-a',
      'tier-a',
      2
    )

    expect(nextSnapshot.tiers[0].itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])
  })

  it('moves items to the front of a tier snapshot', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-3',
      'tier-a',
      'tier-a',
      0
    )

    expect(nextSnapshot.tiers[0].itemIds).toEqual([
      'item-3',
      'item-1',
      'item-2',
    ])
  })

  it('moves items across tiers at the requested insertion index', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-2',
      'tier-a',
      'tier-b',
      1
    )

    expect(nextSnapshot.tiers[0].itemIds).toEqual(['item-1', 'item-3'])
    expect(nextSnapshot.tiers[1].itemIds).toEqual(['item-4', 'item-2'])
  })

  it('moves items from a tier back to the unranked pool', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-2',
      'tier-a',
      UNRANKED_CONTAINER_ID,
      1
    )

    expect(nextSnapshot.tiers[0].itemIds).toEqual(['item-1', 'item-3'])
    expect(nextSnapshot.unrankedItemIds).toEqual(['item-5', 'item-2', 'item-6'])
  })

  it('moves items from the unranked pool into a tier', () =>
  {
    const nextSnapshot = moveItemInSnapshot(
      createSnapshot(),
      'item-5',
      UNRANKED_CONTAINER_ID,
      'tier-b',
      0
    )

    expect(nextSnapshot.unrankedItemIds).toEqual(['item-6'])
    expect(nextSnapshot.tiers[1].itemIds).toEqual(['item-5', 'item-4'])
  })

  it('appends to the end when hovering a container-level drop target', () =>
  {
    const nextSnapshot = resolveNextDragPreview({
      snapshot: createSnapshot(),
      itemId: 'item-5',
      overId: 'tier-a',
      draggedRect: createRect({ left: 350 }),
      overRect: createRect({ left: 0, width: 420 }),
    })

    expect(nextSnapshot.unrankedItemIds).toEqual(['item-6'])
    expect(nextSnapshot.tiers[0].itemIds).toEqual([
      'item-1',
      'item-2',
      'item-3',
      'item-5',
    ])
  })

  it('keeps the immediate right-neighbor hover stable after the preview has already swapped', () =>
  {
    const swappedPreview = resolveNextDragPreview({
      snapshot: createSnapshot(),
      itemId: 'item-1',
      overId: 'item-2',
      draggedRect: createRect({ left: 160 }),
      overRect: createRect({ left: 100 }),
    })

    expect(swappedPreview.tiers[0].itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])

    const stablePreview = resolveNextDragPreview({
      snapshot: swappedPreview,
      itemId: 'item-1',
      overId: 'item-2',
      draggedRect: createRect({ left: 90 }),
      overRect: createRect({ left: 0 }),
    })

    expect(stablePreview).toBe(swappedPreview)
    expect(stablePreview.tiers[0].itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])
  })

  it('does not undo a right-neighbor swap when later hover events are resolved from the preview order', () =>
  {
    const swappedPreview = resolveNextDragPreview({
      snapshot: createSnapshot(),
      itemId: 'item-1',
      overId: 'item-2',
      draggedRect: createRect({ left: 160 }),
      overRect: createRect({ left: 100 }),
    })

    const settledPreview = resolveNextDragPreview({
      snapshot: swappedPreview,
      itemId: 'item-1',
      overId: 'item-3',
      draggedRect: createRect({ left: 150 }),
      overRect: createRect({ left: 200 }),
    })

    expect(settledPreview).toBe(swappedPreview)
    expect(settledPreview.tiers[0].itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])
  })
})
