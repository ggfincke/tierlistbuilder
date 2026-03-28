// src/utils/__tests__/dragPointerMath.test.ts
// unit tests for dragged-rect derivation, pointer targeting, & preview moves

import type { ClientRect, Translate } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'

import type { ContainerSnapshot } from '../../types'
import {
  getDraggedItemRect,
  isPointerInTrailingLastRowSpace,
  resolveDragTargetIndex,
  resolveNextDragPreview,
} from '../dragPointerMath'

const makeRect = (overrides: Partial<ClientRect> = {}): ClientRect =>
  ({
    top: 0,
    bottom: 50,
    left: 0,
    right: 100,
    width: 100,
    height: 50,
    ...overrides,
  }) as ClientRect

const delta: Translate = { x: 25, y: -10 }

const snapshot: ContainerSnapshot = {
  tiers: [
    { id: 'tier-a', itemIds: ['a1', 'a2'] },
    { id: 'tier-b', itemIds: [] },
  ],
  unrankedItemIds: ['u1'],
}

describe('getDraggedItemRect', () =>
{
  it('prefers the translated rect when dnd-kit already provides one', () =>
  {
    const translatedRect = makeRect({ left: 20, right: 120 })

    expect(
      getDraggedItemRect({
        translatedRect,
        initialRect: makeRect(),
        delta,
      })
    ).toBe(translatedRect)
  })

  it('builds a translated rect from the initial rect & pointer delta', () =>
  {
    expect(
      getDraggedItemRect({
        translatedRect: null,
        initialRect: makeRect({ left: 10, right: 110, top: 40, bottom: 90 }),
        delta,
      })
    ).toEqual(
      makeRect({ left: 35, right: 135, top: 30, bottom: 80, width: 100 })
    )
  })
})

describe('isPointerInTrailingLastRowSpace', () =>
{
  it('detects pointer space to the right of the last rendered row', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 190, y: 75 },
        itemRects: [
          makeRect({ left: 0, right: 60, top: 0, bottom: 40 }),
          makeRect({ left: 70, right: 130, top: 0, bottom: 40 }),
          makeRect({ left: 0, right: 80, top: 60, bottom: 100 }),
          makeRect({ left: 90, right: 160, top: 60, bottom: 100 }),
        ],
      })
    ).toBe(true)
  })

  it('returns false when the pointer is outside the last row bounds', () =>
  {
    expect(
      isPointerInTrailingLastRowSpace({
        pointerCoordinates: { x: 190, y: 140 },
        itemRects: [makeRect({ left: 0, right: 80, top: 60, bottom: 100 })],
      })
    ).toBe(false)
  })
})

describe('resolveDragTargetIndex', () =>
{
  it('drops at the end when hovering the container itself', () =>
  {
    expect(
      resolveDragTargetIndex({
        draggedRect: makeRect({ left: 10, right: 110 }),
        overRect: makeRect(),
        overId: 'tier-a',
        overContainerId: 'tier-a',
        overIndex: -1,
        overItemsLength: 2,
      })
    ).toBe(2)
  })

  it('honors explicit front & back drops on the first and last items', () =>
  {
    expect(
      resolveDragTargetIndex({
        draggedRect: makeRect({ left: -30, right: 20 }),
        overRect: makeRect({ left: 40, right: 140 }),
        overId: 'a1',
        overContainerId: 'tier-a',
        overIndex: 0,
        overItemsLength: 2,
      })
    ).toBe(0)

    expect(
      resolveDragTargetIndex({
        draggedRect: makeRect({ left: 160, right: 260 }),
        overRect: makeRect({ left: 40, right: 140 }),
        overId: 'a2',
        overContainerId: 'tier-a',
        overIndex: 1,
        overItemsLength: 2,
      })
    ).toBe(2)
  })
})

describe('resolveNextDragPreview', () =>
{
  it('moves an item into an empty container when hovering the container itself', () =>
  {
    const next = resolveNextDragPreview({
      snapshot,
      itemId: 'u1',
      overId: 'tier-b',
      draggedRect: makeRect({ left: 20, right: 120 }),
      overRect: makeRect({ left: 200, right: 300 }),
    })

    expect(next.tiers[1].itemIds).toEqual(['u1'])
    expect(next.unrankedItemIds).toEqual([])
  })

  it('returns the same snapshot for a no-op same-container hover', () =>
  {
    const next = resolveNextDragPreview({
      snapshot,
      itemId: 'a1',
      overId: 'a2',
      draggedRect: makeRect({ left: 0, right: 80 }),
      overRect: makeRect({ left: 80, right: 180 }),
    })

    expect(next).toBe(snapshot)
  })
})
