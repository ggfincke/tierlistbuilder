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
  it('sorts alphabetically (case-insensitive) & pushes unlabeled items last', () =>
  {
    const items = { a: { label: 'Bravo' }, b: { label: 'alpha' }, c: {} }
    expect(
      ['a', 'b', 'c'].sort((left, right) => compareByLabel(items, left, right))
    ).toEqual(['b', 'a', 'c'])
  })
})

describe('fisherYatesShuffle', () =>
{
  it('uses the provided random resolver for deterministic shuffles', () =>
  {
    expect(
      fisherYatesShuffle(['a', 'b', 'c', 'd'], makeRandomIndexResolver(0, 0, 0))
    ).toEqual(['b', 'c', 'd', 'a'])
  })
})

describe('sortTierItemsByName', () =>
{
  it('sorts the target tier in-place & returns null when nothing to do', () =>
  {
    const tiers = [
      makeTier({ id: 'tier-s', itemIds: ids('b', 'c', 'a') }),
      makeTier({ id: 'tier-a', itemIds: ids('z') }),
    ]
    const items = {
      a: { label: 'Alpha' },
      b: { label: 'Bravo' },
      c: {},
      z: { label: 'Zulu' },
    }

    const result = sortTierItemsByName(tiers, 'tier-s', items)
    expect(result?.[0].itemIds).toEqual(['a', 'b', 'c'])
    // original input not mutated
    expect(tiers[0].itemIds).toEqual(['b', 'c', 'a'])

    expect(sortTierItemsByName(tiers, 'tier-x', items)).toBeNull()
    expect(
      sortTierItemsByName(
        [makeTier({ id: 'tier-s', itemIds: ids('a') })],
        'tier-s',
        { a: { label: 'A' } }
      )
    ).toBeNull()
  })
})

describe('shuffleAllBoardItems', () =>
{
  it('redistributes all items across tiers, supporting even & random modes', () =>
  {
    const tiers = [
      makeTier({ id: 'tier-s', itemIds: ids('a', 'b') }),
      makeTier({ id: 'tier-a', itemIds: ids('c') }),
    ]

    const even = shuffleAllBoardItems(
      tiers,
      ids('d'),
      'even',
      makeRandomIndexResolver(0, 0, 0)
    )
    expect(even?.unrankedItemIds).toEqual([])
    expect(even?.tiers.flatMap((t) => t.itemIds).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])

    const random = shuffleAllBoardItems(
      tiers,
      ids('d'),
      'random',
      makeRandomIndexResolver(0, 0, 1, 0, 1)
    )
    expect(random?.unrankedItemIds).toEqual([])

    expect(
      shuffleAllBoardItems([], ids('a'), 'even', makeRandomIndexResolver())
    ).toBeNull()
    expect(
      shuffleAllBoardItems(
        [makeTier({ id: 'tier-s' })],
        [],
        'even',
        makeRandomIndexResolver()
      )
    ).toBeNull()
  })
})

describe('shuffleUnrankedItems', () =>
{
  it('interleaves unranked items into tiers without disturbing ranked order', () =>
  {
    const tiers = [
      makeTier({ id: 'tier-s', itemIds: ids('ranked-s-1', 'ranked-s-2') }),
      makeTier({ id: 'tier-a', itemIds: ids('ranked-a-1') }),
    ]

    const result = shuffleUnrankedItems(
      tiers,
      ids('u1', 'u2', 'u3'),
      makeRandomIndexResolver(0, 0, 0, 0, 0, 1, 1, 0)
    )
    expect(result?.unrankedItemIds).toEqual([])
    // ranked items must appear in their original relative order
    const sIds = result?.tiers[0].itemIds ?? []
    expect(sIds.indexOf('ranked-s-1')).toBeLessThan(sIds.indexOf('ranked-s-2'))

    expect(
      shuffleUnrankedItems([], ids('u1'), makeRandomIndexResolver())
    ).toBeNull()
    expect(
      shuffleUnrankedItems(
        [makeTier({ id: 'tier-s', itemIds: ids('ranked') })],
        [],
        makeRandomIndexResolver()
      )
    ).toBeNull()
  })
})
