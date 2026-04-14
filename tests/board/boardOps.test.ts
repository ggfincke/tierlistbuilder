import { describe, expect, it } from 'vitest'

import {
  compareByLabel,
  fisherYatesShuffle,
  shuffleAllBoardItems,
  shuffleUnrankedItems,
  sortTierItemsByName,
} from '@/features/workspace/boards/model/boardOps'
import { createPaletteTierColorSpec } from '@/shared/theme/tierColors'
import type { Tier } from '@/features/workspace/boards/model/contract'
import type { TierId } from '@/shared/types/ids'

const makeTier = (
  id: TierId,
  name: string,
  itemIds: string[],
  paletteIndex = 0
): Tier => ({
  id,
  name,
  colorSpec: createPaletteTierColorSpec(paletteIndex),
  itemIds,
})

const makeRandomIndexResolver = (...values: number[]) =>
{
  let index = 0

  return (maxExclusive: number): number =>
  {
    const value = values[index] ?? 0
    index++

    if (value < 0 || value >= maxExclusive)
    {
      throw new Error(
        `Random resolver value ${value} is outside 0..${maxExclusive - 1}`
      )
    }

    return value
  }
}

describe('compareByLabel', () =>
{
  it('sorts alphabetically & pushes unlabeled items last', () =>
  {
    const items = {
      a: { label: 'Bravo' },
      b: { label: 'alpha' },
      c: {},
    }

    expect(
      ['a', 'b', 'c'].sort((left, right) => compareByLabel(items, left, right))
    ).toEqual(['b', 'a', 'c'])
  })
})

describe('fisherYatesShuffle', () =>
{
  it('uses the provided random resolver for deterministic shuffles', () =>
  {
    const result = fisherYatesShuffle(
      ['a', 'b', 'c', 'd'],
      makeRandomIndexResolver(0, 0, 0)
    )

    expect(result).toEqual(['b', 'c', 'd', 'a'])
  })
})

describe('sortTierItemsByName', () =>
{
  it('returns updated tiers for the target tier only', () =>
  {
    const tiers = [
      makeTier('tier-s', 'S', ['b', 'c', 'a']),
      makeTier('tier-a', 'A', ['z'], 1),
    ]
    const items = {
      a: { label: 'Alpha' },
      b: { label: 'Bravo' },
      c: {},
      z: { label: 'Zulu' },
    }

    const result = sortTierItemsByName(tiers, 'tier-s', items)

    expect(result).toEqual([
      makeTier('tier-s', 'S', ['a', 'b', 'c']),
      makeTier('tier-a', 'A', ['z'], 1),
    ])
    expect(tiers[0].itemIds).toEqual(['b', 'c', 'a'])
  })

  it('returns null when the target tier is missing or too small', () =>
  {
    const tiers = [makeTier('tier-s', 'S', ['a'])]
    const items = { a: { label: 'Alpha' } }

    expect(sortTierItemsByName(tiers, 'tier-x', items)).toBeNull()
    expect(sortTierItemsByName(tiers, 'tier-s', items)).toBeNull()
  })
})

describe('shuffleAllBoardItems', () =>
{
  it('redistributes all items evenly after shuffling', () =>
  {
    const tiers = [
      makeTier('tier-s', 'S', ['a', 'b']),
      makeTier('tier-a', 'A', ['c']),
    ]

    const result = shuffleAllBoardItems(
      tiers,
      ['d'],
      'even',
      makeRandomIndexResolver(0, 0, 0)
    )

    expect(result).toEqual({
      tiers: [
        makeTier('tier-s', 'S', ['b', 'd']),
        makeTier('tier-a', 'A', ['c', 'a']),
      ],
      unrankedItemIds: [],
    })
  })

  it('supports uneven random distribution across tiers', () =>
  {
    const tiers = [
      makeTier('tier-s', 'S', ['a']),
      makeTier('tier-a', 'A', ['b']),
    ]

    const result = shuffleAllBoardItems(
      tiers,
      ['c'],
      'random',
      makeRandomIndexResolver(0, 0, 1, 0, 1)
    )

    expect(result).toEqual({
      tiers: [
        makeTier('tier-s', 'S', ['c']),
        makeTier('tier-a', 'A', ['b', 'a']),
      ],
      unrankedItemIds: [],
    })
  })

  it('returns null when no shuffle can happen', () =>
  {
    expect(
      shuffleAllBoardItems([], ['a'], 'even', makeRandomIndexResolver())
    ).toBeNull()

    expect(
      shuffleAllBoardItems(
        [makeTier('tier-s', 'S', [])],
        [],
        'even',
        makeRandomIndexResolver()
      )
    ).toBeNull()
  })
})

describe('shuffleUnrankedItems', () =>
{
  it('keeps ranked order intact while interleaving shuffled unranked items', () =>
  {
    const tiers = [
      makeTier('tier-s', 'S', ['ranked-s-1', 'ranked-s-2']),
      makeTier('tier-a', 'A', ['ranked-a-1']),
    ]

    const result = shuffleUnrankedItems(
      tiers,
      ['u1', 'u2', 'u3'],
      makeRandomIndexResolver(0, 0, 0, 0, 0, 1, 1, 0)
    )

    expect(result).toEqual({
      tiers: [
        makeTier('tier-s', 'S', ['u1', 'ranked-s-1', 'u3', 'u2', 'ranked-s-2']),
        makeTier('tier-a', 'A', ['ranked-a-1']),
      ],
      unrankedItemIds: [],
    })
  })

  it('returns null when the unranked pool or tier list is empty', () =>
  {
    expect(
      shuffleUnrankedItems([], ['u1'], makeRandomIndexResolver())
    ).toBeNull()

    expect(
      shuffleUnrankedItems(
        [makeTier('tier-s', 'S', ['ranked'])],
        [],
        makeRandomIndexResolver()
      )
    ).toBeNull()
  })
})
