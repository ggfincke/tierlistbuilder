// tests/overlay/progressOverlay.test.ts
// blocking progress overlay normalization

import { describe, expect, it } from 'vitest'

import { resolveProgressOverlayState } from '~/shared/overlay/progress'

describe('resolveProgressOverlayState', () =>
{
  it('hides the overlay when total is zero or invalid', () =>
  {
    expect(resolveProgressOverlayState(1, 0)).toEqual({
      visible: false,
      current: 0,
      total: 0,
      percent: 0,
    })
    expect(resolveProgressOverlayState(1, Number.NaN)).toEqual({
      visible: false,
      current: 0,
      total: 0,
      percent: 0,
    })
  })

  it('clamps current progress into the valid range', () =>
  {
    expect(resolveProgressOverlayState(12, 10)).toEqual({
      visible: true,
      current: 10,
      total: 10,
      percent: 100,
    })
    expect(resolveProgressOverlayState(-4, 10)).toEqual({
      visible: true,
      current: 0,
      total: 10,
      percent: 0,
    })
  })

  it('rounds the percentage for aria and width output', () =>
  {
    expect(resolveProgressOverlayState(1, 3)).toEqual({
      visible: true,
      current: 1,
      total: 3,
      percent: 33,
    })
  })
})
