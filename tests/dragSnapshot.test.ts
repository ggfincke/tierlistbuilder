import { describe, it, expect } from 'vitest'
import {
  createContainerSnapshot,
  findContainer,
  isSnapshotConsistent,
  moveItemInSnapshot,
  moveItemToIndexInSnapshot,
  resolveStoreInsertionIndex,
} from '../src/utils/dragSnapshot'
import { makeSnapshot } from './fixtures'

describe('createContainerSnapshot', () =>
{
  it('captures tier & unranked item ordering', () =>
  {
    const state = {
      tiers: [
        {
          id: 't1',
          name: 'S',
          colorSpec: { kind: 'custom' as const, hex: '#f00' },
          itemIds: ['a', 'b'],
        },
      ],
      unrankedItemIds: ['c'],
    }
    const snap = createContainerSnapshot(state)
    expect(snap.tiers).toEqual([{ id: 't1', itemIds: ['a', 'b'] }])
    expect(snap.unrankedItemIds).toEqual(['c'])
  })

  it('produces a defensive copy', () =>
  {
    const state = {
      tiers: [
        {
          id: 't1',
          name: 'S',
          colorSpec: { kind: 'custom' as const, hex: '#f00' },
          itemIds: ['a'],
        },
      ],
      unrankedItemIds: ['b'],
    }
    const snap = createContainerSnapshot(state)
    snap.tiers[0].itemIds.push('mutated')
    snap.unrankedItemIds.push('mutated')
    expect(state.tiers[0].itemIds).toEqual(['a'])
    expect(state.unrankedItemIds).toEqual(['b'])
  })
})

describe('findContainer', () =>
{
  const snap = makeSnapshot()

  it('returns tier ID when item is in a tier', () =>
  {
    expect(findContainer(snap, 'item-1')).toBe('tier-s')
    expect(findContainer(snap, 'item-4')).toBe('tier-a')
  })

  it('returns "unranked" when item is in the unranked pool', () =>
  {
    expect(findContainer(snap, 'item-6')).toBe('unranked')
  })

  it('returns null when item does not exist', () =>
  {
    expect(findContainer(snap, 'nonexistent')).toBeNull()
  })
})

describe('isSnapshotConsistent', () =>
{
  it('returns true when snapshot matches state', () =>
  {
    const state = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom' as const, hex: '#f00' },
          itemIds: ['a', 'b'],
        },
      ],
      unrankedItemIds: ['c'],
    }
    const snap = {
      tiers: [{ id: 'tier-s', itemIds: ['a', 'b'] }],
      unrankedItemIds: ['c'],
    }
    expect(isSnapshotConsistent(snap, state)).toBe(true)
  })

  it('returns false when snapshot is missing an item (orphan in state)', () =>
  {
    const state = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom' as const, hex: '#f00' },
          itemIds: ['a', 'b'],
        },
      ],
      unrankedItemIds: ['c'],
    }
    // snapshot only has 'a' & 'c' — missing 'b'
    const snap = {
      tiers: [{ id: 'tier-s', itemIds: ['a'] }],
      unrankedItemIds: ['c'],
    }
    expect(isSnapshotConsistent(snap, state)).toBe(false)
  })

  it('returns false when snapshot contains a phantom item', () =>
  {
    const state = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom' as const, hex: '#f00' },
          itemIds: ['a'],
        },
      ],
      unrankedItemIds: [],
    }
    // snapshot has 'a' & 'ghost' — same count trick won't work, ghost is not in state
    const snap = {
      tiers: [{ id: 'tier-s', itemIds: ['a', 'ghost'] }],
      unrankedItemIds: [],
    }
    expect(isSnapshotConsistent(snap, state)).toBe(false)
  })
})

describe('moveItemInSnapshot', () =>
{
  it('reorders an item within the same tier', () =>
  {
    const snap = makeSnapshot()
    // move item-1 from index 0 to index 2 in tier-s
    const result = moveItemInSnapshot(snap, 'item-1', 'tier-s', 'tier-s', 2)
    const tierS = result.tiers.find((t) => t.id === 'tier-s')!
    expect(tierS.itemIds).toEqual(['item-2', 'item-1', 'item-3'])
  })

  it('moves an item from a tier to the unranked pool', () =>
  {
    const snap = makeSnapshot()
    const result = moveItemInSnapshot(snap, 'item-1', 'tier-s', 'unranked', 0)
    const tierS = result.tiers.find((t) => t.id === 'tier-s')!
    expect(tierS.itemIds).not.toContain('item-1')
    expect(result.unrankedItemIds[0]).toBe('item-1')
  })

  it('returns unchanged snapshot when source container is invalid', () =>
  {
    const snap = makeSnapshot()
    const result = moveItemInSnapshot(
      snap,
      'item-1',
      'nonexistent',
      'tier-a',
      0
    )
    expect(result).toBe(snap)
  })
})

describe('moveItemToIndexInSnapshot', () =>
{
  it('moves an item to an exact index in a different container', () =>
  {
    const snap = makeSnapshot()
    const result = moveItemToIndexInSnapshot({
      snapshot: snap,
      itemId: 'item-6',
      toContainerId: 'tier-a',
      toIndex: 1,
    })
    const tierA = result.tiers.find((t) => t.id === 'tier-a')!
    expect(tierA.itemIds).toEqual(['item-4', 'item-6', 'item-5'])
    expect(result.unrankedItemIds).not.toContain('item-6')
  })
})

describe('resolveStoreInsertionIndex', () =>
{
  it('decrements target index for same-container moves when target > source', () =>
  {
    expect(
      resolveStoreInsertionIndex({
        sameContainer: true,
        sourceIndex: 1,
        targetIndex: 3,
        targetItemsLength: 5,
      })
    ).toBe(2)
  })

  it('uses target index as-is for cross-container moves', () =>
  {
    expect(
      resolveStoreInsertionIndex({
        sameContainer: false,
        sourceIndex: 0,
        targetIndex: 2,
        targetItemsLength: 5,
      })
    ).toBe(2)
  })
})
