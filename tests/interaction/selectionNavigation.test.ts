import { describe, expect, it } from 'vitest'

import { resolveNextSelectionIndex } from '@/shared/selection/selectionNavigation'

describe('resolveNextSelectionIndex', () =>
{
  it('wraps horizontal navigation', () =>
  {
    expect(
      resolveNextSelectionIndex({
        currentIndex: 0,
        itemCount: 4,
        key: 'ArrowLeft',
      })
    ).toBe(3)

    expect(
      resolveNextSelectionIndex({
        currentIndex: 3,
        itemCount: 4,
        key: 'ArrowRight',
      })
    ).toBe(0)
  })

  it('supports Home & End', () =>
  {
    expect(
      resolveNextSelectionIndex({
        currentIndex: 2,
        itemCount: 5,
        key: 'Home',
      })
    ).toBe(0)

    expect(
      resolveNextSelectionIndex({
        currentIndex: 2,
        itemCount: 5,
        key: 'End',
      })
    ).toBe(4)
  })

  it('wraps grid navigation across rows', () =>
  {
    expect(
      resolveNextSelectionIndex({
        currentIndex: 1,
        itemCount: 6,
        columns: 4,
        key: 'ArrowDown',
      })
    ).toBe(5)

    expect(
      resolveNextSelectionIndex({
        currentIndex: 5,
        itemCount: 6,
        columns: 4,
        key: 'ArrowDown',
      })
    ).toBe(1)

    expect(
      resolveNextSelectionIndex({
        currentIndex: 1,
        itemCount: 6,
        columns: 4,
        key: 'ArrowUp',
      })
    ).toBe(5)
  })

  it('returns null for invalid positions', () =>
  {
    expect(
      resolveNextSelectionIndex({
        currentIndex: -1,
        itemCount: 3,
        key: 'ArrowRight',
      })
    ).toBeNull()
  })
})
