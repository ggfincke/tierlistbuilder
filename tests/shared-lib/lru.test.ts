// tests/shared-lib/lru.test.ts
// coverage for insertion-order Map pruning helper

import { describe, expect, it } from 'vitest'

import { pruneOldestMapEntries } from '~/shared/lib/lru'

describe('pruneOldestMapEntries', () =>
{
  it('drops oldest entries until the map reaches the requested size', () =>
  {
    const cache = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ])

    pruneOldestMapEntries(cache, 2)

    expect([...cache.entries()]).toEqual([
      ['c', 3],
      ['d', 4],
    ])
  })

  it('skips protected entries while pruning', () =>
  {
    const cache = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ])

    pruneOldestMapEntries(cache, 2, (key) => key === 'a')

    expect([...cache.entries()]).toEqual([
      ['a', 1],
      ['d', 4],
    ])
  })

  it('reports pruned entries to the cleanup callback', () =>
  {
    const cache = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    const pruned: Array<[string, number]> = []

    pruneOldestMapEntries(
      cache,
      1,
      () => false,
      (key, value) => pruned.push([key, value])
    )

    expect([...cache.entries()]).toEqual([['c', 3]])
    expect(pruned).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })
})
