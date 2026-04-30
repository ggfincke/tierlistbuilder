// tests/board/boardStats.test.ts
// board-stat summary edge cases for tier counts & population labels

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { computeBoardStats } from '~/features/workspace/stats/model/boardStats'
import { makeBoardSnapshot, makeTier } from '../fixtures'

describe('computeBoardStats', () =>
{
  it('reports empty boards without populated tiers', () =>
  {
    const stats = computeBoardStats(
      makeBoardSnapshot({
        tiers: [
          makeTier({ id: 'tier-s', name: 'S', itemIds: [] }),
          makeTier({ id: 'tier-a', name: 'A', itemIds: [] }),
        ],
      }),
      'classic'
    )

    expect(stats.totalItems).toBe(0)
    expect(stats.rankedItems).toBe(0)
    expect(stats.averageTierRank).toBeNull()
    expect(stats.mostPopulatedTier).toBeNull()
    expect(stats.leastPopulatedTier).toBeNull()
    expect(stats.emptyTiers).toBe(2)
  })

  it('matches stable sort tie behavior without sorting tiers', () =>
  {
    const stats = computeBoardStats(
      makeBoardSnapshot({
        tiers: [
          makeTier({
            id: 'tier-s',
            name: 'S',
            itemIds: [asItemId('item-1'), asItemId('item-2')],
          }),
          makeTier({
            id: 'tier-a',
            name: 'A',
            itemIds: [asItemId('item-3')],
          }),
          makeTier({
            id: 'tier-b',
            name: 'B',
            itemIds: [asItemId('item-4'), asItemId('item-5')],
          }),
          makeTier({
            id: 'tier-c',
            name: 'C',
            itemIds: [asItemId('item-6')],
          }),
        ],
      }),
      'classic'
    )

    expect(stats.mostPopulatedTier).toBe('S')
    expect(stats.leastPopulatedTier).toBe('C')
    expect(stats.rankedItems).toBe(6)
  })
})
