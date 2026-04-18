// tests/board/constants.test.ts
// default board constants & tier seeds

import { describe, it, expect } from 'vitest'
import { buildDefaultTiers } from '~/features/workspace/boards/lib/boardDefaults'
import { toFileBase } from '~/shared/lib/fileName'
import { clamp } from '~/shared/lib/math'

describe('toFileBase', () =>
{
  it('converts a normal title to a URL-safe slug', () =>
  {
    expect(toFileBase('My Tier List')).toBe('my-tier-list')
  })

  it('returns fallback for whitespace-only input', () =>
  {
    expect(toFileBase('   ')).toBe('tier-list')
  })
})

describe('clamp', () =>
{
  it('clamps values to [min, max] inclusive', () =>
  {
    expect(clamp(-1, 0, 5)).toBe(0)
    expect(clamp(10, 0, 5)).toBe(5)
    expect(clamp(3, 0, 5)).toBe(3)
  })
})

describe('buildDefaultTiers', () =>
{
  it('produces 6 tiers w/ correct names, palette colorSpecs, & empty itemIds', () =>
  {
    const tiers = buildDefaultTiers('classic')
    expect(tiers).toHaveLength(6)
    expect(tiers.map((t) => t.name)).toEqual(['S', 'A', 'B', 'C', 'D', 'E'])
    for (const [i, tier] of tiers.entries())
    {
      expect(tier.itemIds).toEqual([])
      expect(tier.colorSpec).toEqual({
        kind: 'palette',
        index: i,
      })
    }
  })
})
