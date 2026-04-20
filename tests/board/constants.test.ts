// tests/board/constants.test.ts
// default tier seeds

import { describe, it, expect } from 'vitest'
import { buildDefaultTiers } from '~/features/workspace/boards/lib/boardDefaults'

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
