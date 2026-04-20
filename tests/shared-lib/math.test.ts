// tests/shared-lib/math.test.ts
// shared numeric helpers

import { describe, it, expect } from 'vitest'
import { clamp } from '~/shared/lib/math'

describe('clamp', () =>
{
  it('clamps values to [min, max] inclusive', () =>
  {
    expect(clamp(-1, 0, 5)).toBe(0)
    expect(clamp(10, 0, 5)).toBe(5)
    expect(clamp(3, 0, 5)).toBe(3)
  })
})
