// tests/board/boardOps.test.ts
// board sorting & shuffling helpers

import { describe, expect, it } from 'vitest'

import {
  compareByLabel,
  fisherYatesShuffle,
  shuffleAllBoardItems,
  shuffleUnrankedItems,
  sortTierItemsByName,
} from '~/features/workspace/boards/model/boardOps'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { brandItemIds as ids, makeTier } from '../fixtures'

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
      makeTier({ id: 'tier-s', name: 'S', itemIds: ids('b', 'c', 'a') }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        itemIds: ids('z'),
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ]
    const items = {
      a: { label: 'Alpha' },
      b: { label: 'Bravo' },
      c: {},
      z: { label: 'Zulu' },
    }

    const result = sortTierItemsByName(tiers, 'tier-s', items)

    expect(result).toEqual([
      makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a', 'b', 'c') }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        itemIds: ids('z'),
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ])
    expect(tiers[0].itemIds).toEqual(['b', 'c', 'a'])
  })

  it('returns null when the target tier is missing or too small', () =>
  {
    const tiers = [makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a') })]
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
      makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a', 'b') }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        itemIds: ids('c'),
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ]

    const result = shuffleAllBoardItems(
      tiers,
      ids('d'),
      'even',
      makeRandomIndexResolver(0, 0, 0)
    )

    expect(result).toEqual({
      tiers: [
        makeTier({ id: 'tier-s', name: 'S', itemIds: ids('b', 'd') }),
        makeTier({
          id: 'tier-a',
          name: 'A',
          itemIds: ids('c', 'a'),
          colorSpec: createPaletteTierColorSpec(1),
        }),
      ],
      unrankedItemIds: [],
    })
  })

  it('supports uneven random distribution across tiers', () =>
  {
    const tiers = [
      makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a') }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        itemIds: ids('b'),
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ]

    const result = shuffleAllBoardItems(
      tiers,
      ids('c'),
      'random',
      makeRandomIndexResolver(0, 0, 1, 0, 1)
    )

    expect(result).toEqual({
      tiers: [
        makeTier({ id: 'tier-s', name: 'S', itemIds: ids('c') }),
        makeTier({
          id: 'tier-a',
          name: 'A',
          itemIds: ids('b', 'a'),
          colorSpec: createPaletteTierColorSpec(1),
        }),
      ],
      unrankedItemIds: [],
    })
  })

  it('returns null when no shuffle can happen', () =>
  {
    expect(
      shuffleAllBoardItems([], ids('a'), 'even', makeRandomIndexResolver())
    ).toBeNull()

    expect(
      shuffleAllBoardItems(
        [makeTier({ id: 'tier-s', name: 'S' })],
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
      makeTier({
        id: 'tier-s',
        name: 'S',
        itemIds: ids('ranked-s-1', 'ranked-s-2'),
      }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        itemIds: ids('ranked-a-1'),
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ]

    const result = shuffleUnrankedItems(
      tiers,
      ids('u1', 'u2', 'u3'),
      makeRandomIndexResolver(0, 0, 0, 0, 0, 1, 1, 0)
    )

    expect(result).toEqual({
      tiers: [
        makeTier({
          id: 'tier-s',
          name: 'S',
          itemIds: ids('u1', 'ranked-s-1', 'u3', 'u2', 'ranked-s-2'),
        }),
        makeTier({
          id: 'tier-a',
          name: 'A',
          itemIds: ids('ranked-a-1'),
          colorSpec: createPaletteTierColorSpec(1),
        }),
      ],
      unrankedItemIds: [],
    })
  })

  it('returns null when the unranked pool or tier list is empty', () =>
  {
    expect(
      shuffleUnrankedItems([], ids('u1'), makeRandomIndexResolver())
    ).toBeNull()

    expect(
      shuffleUnrankedItems(
        [makeTier({ id: 'tier-s', name: 'S', itemIds: ids('ranked') })],
        [],
        makeRandomIndexResolver()
      )
    ).toBeNull()
  })
})
