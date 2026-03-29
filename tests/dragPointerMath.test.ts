import { describe, it, expect } from 'vitest'
import {
  getDraggedItemRect,
  resolveDragTargetIndex,
} from '../src/utils/dragPointerMath'

const makeRect = (
  left: number,
  top: number,
  width: number,
  height: number
) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
})

describe('getDraggedItemRect', () =>
{
  it('returns translatedRect when available', () =>
  {
    const translated = makeRect(10, 20, 100, 50)
    const result = getDraggedItemRect({
      translatedRect: translated,
      initialRect: makeRect(0, 0, 100, 50),
      delta: { x: 5, y: 5 },
    })
    expect(result).toBe(translated)
  })

  it('computes rect from initialRect + delta when translatedRect is null', () =>
  {
    const result = getDraggedItemRect({
      translatedRect: null,
      initialRect: makeRect(0, 0, 100, 50),
      delta: { x: 10, y: 20 },
    })
    expect(result).toEqual({
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
      draggedRect: makeRect(0, 0, 100, 50),
      overRect: makeRect(0, 0, 500, 50),
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
      draggedRect: makeRect(0, 0, 50, 50),
      overRect: makeRect(100, 0, 50, 50),
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
      draggedRect: makeRect(300, 0, 50, 50),
      overRect: makeRect(200, 0, 50, 50),
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
      draggedRect: makeRect(160, 0, 50, 50),
      overRect: makeRect(100, 0, 50, 50),
      overId: 'item-2',
      overContainerId: 'tier-s',
      overIndex: 1,
      overItemsLength: 3,
    })
    expect(result).toBe(2)
  })
})
