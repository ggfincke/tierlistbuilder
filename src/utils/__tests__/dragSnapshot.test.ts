// src/utils/__tests__/dragSnapshot.test.ts
// unit tests for snapshot creation, lookup, consistency, & item moves

import { describe, expect, it } from 'vitest'

import type { ContainerSnapshot, TierListData } from '../../types'
import { UNRANKED_CONTAINER_ID } from '../constants'
import {
  applyContainerSnapshotToTiers,
  createContainerSnapshot,
  findContainer,
  getEffectiveContainerSnapshot,
  getEffectiveTiers,
  getEffectiveUnrankedItemIds,
  getItemsInContainer,
  isSnapshotConsistent,
  moveItemInSnapshot,
  moveItemToIndexInSnapshot,
  resolveStoreInsertionIndex,
} from '../dragSnapshot'

const baseState: TierListData = {
  title: 'Board',
  tiers: [
    {
      id: 'tier-a',
      name: 'A',
      color: '#aa0000',
      colorSource: null,
      itemIds: ['a1', 'a2', 'a3'],
    },
    {
      id: 'tier-b',
      name: 'B',
      color: '#00aa00',
      colorSource: null,
      itemIds: ['b1'],
    },
  ],
  unrankedItemIds: ['u1'],
  items: {},
  deletedItems: [],
}

const preview: ContainerSnapshot = {
  tiers: [
    { id: 'tier-a', itemIds: ['a2', 'a1', 'a3'] },
    { id: 'tier-b', itemIds: ['b1', 'u1'] },
  ],
  unrankedItemIds: [],
}

describe('snapshot creation & effective reads', () =>
{
  it('copies container order into a detached snapshot', () =>
  {
    const snapshot = createContainerSnapshot(baseState)

    expect(snapshot).toEqual({
      tiers: [
        { id: 'tier-a', itemIds: ['a1', 'a2', 'a3'] },
        { id: 'tier-b', itemIds: ['b1'] },
      ],
      unrankedItemIds: ['u1'],
    })

    snapshot.tiers[0].itemIds.push('new-item')
    expect(baseState.tiers[0].itemIds).toEqual(['a1', 'a2', 'a3'])
  })

  it('prefers dragPreview when reading effective ordering', () =>
  {
    const effective = getEffectiveContainerSnapshot({
      tiers: baseState.tiers,
      unrankedItemIds: baseState.unrankedItemIds,
      dragPreview: preview,
    })

    expect(effective).toEqual(preview)
    expect(getEffectiveTiers(baseState.tiers, preview)[0].itemIds).toEqual([
      'a2',
      'a1',
      'a3',
    ])
    expect(
      getEffectiveUnrankedItemIds(baseState.unrankedItemIds, preview)
    ).toEqual([])
  })

  it('applies snapshot ordering onto tier metadata without losing labels', () =>
  {
    const tiers = applyContainerSnapshotToTiers(baseState.tiers, preview)

    expect(tiers[0]).toMatchObject({
      id: 'tier-a',
      name: 'A',
      color: '#aa0000',
      itemIds: ['a2', 'a1', 'a3'],
    })
  })
})

describe('snapshot lookup & consistency', () =>
{
  it('finds containers by container id or item id', () =>
  {
    const snapshot = createContainerSnapshot(baseState)

    expect(findContainer(snapshot, 'tier-a')).toBe('tier-a')
    expect(findContainer(snapshot, 'b1')).toBe('tier-b')
    expect(findContainer(snapshot, 'u1')).toBe(UNRANKED_CONTAINER_ID)
    expect(findContainer(snapshot, 'missing')).toBeNull()
  })

  it('exposes ordered items for tiers & the unranked pool', () =>
  {
    const snapshot = createContainerSnapshot(baseState)

    expect(getItemsInContainer(snapshot, 'tier-a')).toEqual(['a1', 'a2', 'a3'])
    expect(getItemsInContainer(snapshot, UNRANKED_CONTAINER_ID)).toEqual(['u1'])
  })

  it('rejects snapshots that add or drop item ids', () =>
  {
    const consistent = createContainerSnapshot(baseState)
    const missingItem = {
      ...consistent,
      tiers: [
        { id: 'tier-a', itemIds: ['a1'] },
        { id: 'tier-b', itemIds: [] },
      ],
    }
    const extraItem = {
      ...consistent,
      unrankedItemIds: ['u1', 'ghost'],
    }

    expect(isSnapshotConsistent(consistent, baseState)).toBe(true)
    expect(isSnapshotConsistent(missingItem, baseState)).toBe(false)
    expect(isSnapshotConsistent(extraItem, baseState)).toBe(false)
  })
})

describe('snapshot movement helpers', () =>
{
  it('adjusts same-container insertion indices after removing the source item', () =>
  {
    expect(
      resolveStoreInsertionIndex({
        sameContainer: true,
        sourceIndex: 0,
        targetIndex: 3,
        targetItemsLength: 2,
      })
    ).toBe(2)
  })

  it('reorders an item within the same tier', () =>
  {
    const next = moveItemInSnapshot(
      createContainerSnapshot(baseState),
      'a1',
      'tier-a',
      'tier-a',
      3
    )

    expect(next.tiers[0].itemIds).toEqual(['a2', 'a3', 'a1'])
  })

  it('moves an item across containers', () =>
  {
    const next = moveItemInSnapshot(
      createContainerSnapshot(baseState),
      'a2',
      'tier-a',
      UNRANKED_CONTAINER_ID,
      0
    )

    expect(next.tiers[0].itemIds).toEqual(['a1', 'a3'])
    expect(next.unrankedItemIds).toEqual(['a2', 'u1'])
  })

  it('moves an item by discovered source container & clamps the target index', () =>
  {
    const next = moveItemToIndexInSnapshot({
      snapshot: createContainerSnapshot(baseState),
      itemId: 'u1',
      toContainerId: 'tier-b',
      toIndex: 99,
    })

    expect(next.tiers[1].itemIds).toEqual(['b1', 'u1'])
    expect(next.unrankedItemIds).toEqual([])
  })
})
