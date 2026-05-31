// tests/overlay/progressOverlay.test.ts
// blocking overlay progress normalization

import { describe, expect, it } from 'vitest'

import { resolveProgressOverlayState } from '~/shared/overlay/progress'

describe('resolveProgressOverlayState', () =>
{
  it('hides on invalid total, clamps current to range, & rounds percentages', () =>
  {
    expect(resolveProgressOverlayState(1, 0)).toEqual({
      visible: false,
      current: 0,
      total: 0,
      percent: 0,
    })
    expect(resolveProgressOverlayState(1, Number.NaN).visible).toBe(false)

    expect(resolveProgressOverlayState(12, 10)).toEqual({
      visible: true,
      current: 10,
      total: 10,
      percent: 100,
    })
    expect(resolveProgressOverlayState(-4, 10).current).toBe(0)

    expect(resolveProgressOverlayState(1, 3).percent).toBe(33)
  })
})
