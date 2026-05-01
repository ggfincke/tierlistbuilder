// tests/dnd/dragSnapshot.test.ts
// drag snapshot transforms & container queries

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
  it('captures tier & unranked ordering w/ a defensive copy', () =>
  {
    const state = {
      tiers: [makeTier({ id: 'tier-t1', itemIds: ids('a', 'b') })],
      unrankedItemIds: ids('c'),
    }
    const snap = createContainerSnapshot(state)
    expect(snap.tiers).toEqual([{ id: 'tier-t1', itemIds: ['a', 'b'] }])
    expect(snap.unrankedItemIds).toEqual(['c'])

    snap.tiers[0].itemIds.push(asItemId('mutated'))
    snap.unrankedItemIds.push(asItemId('mutated'))
    expect(state.tiers[0].itemIds).toEqual(['a', 'b'])
    expect(state.unrankedItemIds).toEqual(['c'])
  })
})

describe('findContainer', () =>
{
  it('returns tier id, "unranked", or null based on item placement', () =>
  {
    const snap = makeContainerSnapshot()
    expect(findContainer(snap, asItemId('item-1'))).toBe('tier-s')
    expect(findContainer(snap, asItemId('item-6'))).toBe('unranked')
    expect(findContainer(snap, asItemId('nonexistent'))).toBeNull()
  })
})

describe('isSnapshotConsistent', () =>
{
  it('detects orphaned items, phantoms, & matching states', () =>
  {
    const state = {
      tiers: [makeTier({ id: 'tier-s', itemIds: ids('a', 'b') })],
      unrankedItemIds: ids('c'),
    }
    expect(
      isSnapshotConsistent(
        {
          tiers: [{ id: 'tier-s', itemIds: ids('a', 'b') }],
          unrankedItemIds: ids('c'),
        },
        state
      )
    ).toBe(true)
    expect(
      isSnapshotConsistent(
        {
          tiers: [{ id: 'tier-s', itemIds: ids('a') }],
          unrankedItemIds: ids('c'),
        },
        state
      )
    ).toBe(false)
    expect(
      isSnapshotConsistent(
        {
          tiers: [{ id: 'tier-s', itemIds: ids('a', 'b', 'ghost') }],
          unrankedItemIds: ids('c'),
        },
        state
      )
    ).toBe(false)
  })
})

describe('moveItemInSnapshot', () =>
{
  it('reorders within a tier, moves to unranked, & no-ops when source is invalid', () =>
  {
    const snap = makeContainerSnapshot()

    const same = moveItemInSnapshot(
      snap,
      asItemId('item-1'),
      'tier-s',
      'tier-s',
      2
    )
    expect(findTierById(same.tiers, 'tier-s').itemIds).toEqual([
      'item-2',
      'item-1',
      'item-3',
    ])

    const cross = moveItemInSnapshot(
      snap,
      asItemId('item-1'),
      'tier-s',
      'unranked',
      0
    )
    expect(findTierById(cross.tiers, 'tier-s').itemIds).not.toContain('item-1')
    expect(cross.unrankedItemIds[0]).toBe('item-1')

    const invalid = moveItemInSnapshot(
      snap,
      asItemId('item-1'),
      'nonexistent',
      'tier-a',
      0
    )
    expect(invalid).toBe(snap)
  })
})

describe('moveItemToIndexInSnapshot', () =>
{
  it('moves an item to an exact index in a different container', () =>
  {
    const result = moveItemToIndexInSnapshot({
      snapshot: makeContainerSnapshot(),
      itemId: asItemId('item-6'),
      toContainerId: 'tier-a',
      toIndex: 1,
    })
    expect(findTierById(result.tiers, 'tier-a').itemIds).toEqual([
      'item-4',
      'item-6',
      'item-5',
    ])
    expect(result.unrankedItemIds).not.toContain('item-6')
  })
})

describe('resolveStoreInsertionIndex', () =>
{
  it('decrements target for forward same-container moves but not for cross-container', () =>
  {
    expect(
      resolveStoreInsertionIndex({
        sameContainer: true,
        sourceIndex: 1,
        targetIndex: 3,
        targetItemsLength: 5,
      })
    ).toBe(2)
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
