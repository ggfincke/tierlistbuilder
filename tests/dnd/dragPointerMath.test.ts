// tests/dnd/dragPointerMath.test.ts
// pointer insertion math

import { describe, it, expect } from 'vitest'
import {
  getDraggedItemRect,
  resolveDragTargetIndex,
} from '~/features/workspace/boards/dnd/dragPointerMath'
import { makeRect } from '../fixtures'

describe('getDraggedItemRect', () =>
{
  it('returns translatedRect when available', () =>
  {
    const translated = makeRect({ left: 10, top: 20, width: 100, height: 50 })
    const result = getDraggedItemRect({
      translatedRect: translated,
      initialRect: makeRect({ width: 100, height: 50 }),
      delta: { x: 5, y: 5 },
    })
    expect(result).toBe(translated)
  })

  it('computes rect from initialRect + delta when translatedRect is null', () =>
  {
    const result = getDraggedItemRect({
      translatedRect: null,
      initialRect: makeRect({ width: 100, height: 50 }),
      delta: { x: 10, y: 20 },
    })
    expect(result).toMatchObject({
      left: 10,
      top: 20,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
    })
  })

  it('returns null when both rects are null', () =>
  {
    const result = getDraggedItemRect({
      translatedRect: null,
      initialRect: null,
      delta: { x: 0, y: 0 },
    })
    expect(result).toBeNull()
  })
})

describe('resolveDragTargetIndex', () =>
{
  it('returns overItemsLength when dropping on empty container', () =>
  {
    const result = resolveDragTargetIndex({
      draggedRect: makeRect({ width: 100, height: 50 }),
      overRect: makeRect({ width: 500, height: 50 }),
      overId: 'tier-a',
      overContainerId: 'tier-a',
      overIndex: 0,
      overItemsLength: 0,
    })
    expect(result).toBe(0)
  })

  it('forces index 0 when dragged left of the first item', () =>
  {
    const result = resolveDragTargetIndex({
      draggedRect: makeRect({ width: 50, height: 50 }),
      overRect: makeRect({ left: 100, width: 50, height: 50 }),
      overId: 'item-1',
      overContainerId: 'tier-s',
      overIndex: 0,
      overItemsLength: 3,
    })
    expect(result).toBe(0)
  })

  it('forces append when dragged right of the last item', () =>
  {
    const result = resolveDragTargetIndex({
      draggedRect: makeRect({ left: 300, width: 50, height: 50 }),
      overRect: makeRect({ left: 200, width: 50, height: 50 }),
      overId: 'item-3',
      overContainerId: 'tier-s',
      overIndex: 2,
      overItemsLength: 3,
    })
    expect(result).toBe(3)
  })

  it('inserts after when dragged midpoint is right of over midpoint', () =>
  {
    // dragged at x=160 (mid=185), over at x=100 (mid=125) — dragged is right, so index+1
    const result = resolveDragTargetIndex({
      draggedRect: makeRect({ left: 160, width: 50, height: 50 }),
      overRect: makeRect({ left: 100, width: 50, height: 50 }),
      overId: 'item-2',
      overContainerId: 'tier-s',
      overIndex: 1,
      overItemsLength: 3,
    })
    expect(result).toBe(2)
  })
})
