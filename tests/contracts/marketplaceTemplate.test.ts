// tests/contracts/marketplaceTemplate.test.ts
// marketplace template contract guardrails

import { describe, expect, it } from 'vitest'

import { isValidCoverFrame } from '@tierlistbuilder/contracts/marketplace/template'

describe('cover frame validation', () =>
{
  it('accepts finite positive frames & rejects non-finite or non-positive extents', () =>
  {
    expect(isValidCoverFrame({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
    expect(isValidCoverFrame({ x: 0.2, y: 0.1, width: 0.5, height: 0.6 })).toBe(
      true
    )
    expect(isValidCoverFrame({ x: -0.01, y: 0, width: 1, height: 1 })).toBe(
      true
    )
    expect(isValidCoverFrame({ x: 0, y: 0, width: 1.01, height: 1 })).toBe(true)

    expect(isValidCoverFrame({ x: 0, y: 0, width: 0, height: 1 })).toBe(false)
    expect(
      isValidCoverFrame({ x: Number.NaN, y: 0, width: 1, height: 1 })
    ).toBe(false)
    expect(
      isValidCoverFrame({
        x: 0,
        y: 0,
        width: Number.POSITIVE_INFINITY,
        height: 1,
      })
    ).toBe(false)
  })
})
