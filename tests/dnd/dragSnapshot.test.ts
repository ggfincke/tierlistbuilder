// tests/dnd/dragSnapshot.test.ts
// drag snapshot container transforms

import { describe, it, expect } from 'vitest'
import {
  createContainerSnapshot,
  findContainer,
  isSnapshotConsistent,
  moveItemInSnapshot,
  moveItemToIndexInSnapshot,
  resolveStoreInsertionIndex,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  brandItemIds as ids,
  findTierById,
  makeContainerSnapshot,
  makeTier,
} from '../fixtures'

describe('createContainerSnapshot', () =>
{
  it('captures tier & unranked item ordering', () =>
  {
    const state = {
      tiers: [
        makeTier({
          id: 'tier-t1',
          name: 'S',
          colorSpec: { kind: 'custom', hex: '#f00' },
          itemIds: ids('a', 'b'),
        }),
      ],
      unrankedItemIds: ids('c'),
    }
    const snap = createContainerSnapshot(state)
    expect(snap.tiers).toEqual([{ id: 'tier-t1', itemIds: ['a', 'b'] }])
    expect(snap.unrankedItemIds).toEqual(['c'])
  })
})

describe('findContainer', () =>
{
  const snap = makeContainerSnapshot()

  it('returns tier ID when item is in a tier', () =>
  {
    expect(findContainer(snap, asItemId('item-1'))).toBe('tier-s')
    expect(findContainer(snap, asItemId('item-4'))).toBe('tier-a')
  })

  it('returns null when item does not exist', () =>
  {
    expect(findContainer(snap, asItemId('nonexistent'))).toBeNull()
  })
})

describe('isSnapshotConsistent', () =>
{
  it('returns false when snapshot is missing an item (orphan in state)', () =>
  {
    const state = {
      tiers: [
        makeTier({
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom', hex: '#f00' },
          itemIds: ids('a', 'b'),
        }),
      ],
      unrankedItemIds: ids('c'),
    }
    const snap = {
      tiers: [{ id: 'tier-s', itemIds: ids('a') }],
      unrankedItemIds: ids('c'),
    }
    expect(isSnapshotConsistent(snap, state)).toBe(false)
  })
})

describe('moveItemInSnapshot', () =>
{
  it('reorders an item within the same tier', () =>
  {
    const snap = makeContainerSnapshot()
    const result = moveItemInSnapshot(
      snap,
      asItemId('item-1'),
      'tier-s',
      'tier-s',
      2
    )
    const tierS = findTierById(result.tiers, 'tier-s')
    expect(tierS.itemIds).toEqual(['item-2', 'item-1', 'item-3'])
  })
})

describe('moveItemToIndexInSnapshot', () =>
{
  it('moves an item to an exact index in a different container', () =>
  {
    const snap = makeContainerSnapshot()
    const result = moveItemToIndexInSnapshot({
      snapshot: snap,
      itemId: asItemId('item-6'),
      toContainerId: 'tier-a',
      toIndex: 1,
    })
    const tierA = findTierById(result.tiers, 'tier-a')
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
