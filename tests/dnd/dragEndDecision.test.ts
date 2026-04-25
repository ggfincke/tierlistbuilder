// tests/dnd/dragEndDecision.test.ts
// pure pointer drag-end decision rules

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { resolveDragEndDecision } from '~/features/workspace/boards/dnd/dragEndDecision'
import { makeContainerSnapshot } from '../fixtures'

describe('resolveDragEndDecision', () =>
{
  it('returns tier reorder indexes for a valid tier drop', () =>
  {
    const result = resolveDragEndDecision({
      activeDrag: { kind: 'tier', tierId: 'tier-s' },
      activeFallbackId: null,
      hasOver: true,
      overId: 'tier-a',
      snapshot: makeContainerSnapshot(),
      tierIds: ['tier-s', 'tier-a', 'tier-b'],
    })

    expect(result).toEqual({ kind: 'tier-reorder', fromIndex: 0, toIndex: 1 })
  })

  it('cancels an item drop when nothing is under the pointer', () =>
  {
    const result = resolveDragEndDecision({
      activeDrag: { kind: 'item', itemId: asItemId('item-1') },
      activeFallbackId: null,
      hasOver: false,
      overId: null,
      snapshot: makeContainerSnapshot(),
      tierIds: ['tier-s', 'tier-a', 'tier-b'],
    })

    expect(result).toEqual({ kind: 'item-cancel', itemId: 'item-1' })
  })

  it('classifies trash drops separately from normal commits', () =>
  {
    const result = resolveDragEndDecision({
      activeDrag: { kind: 'item', itemId: asItemId('item-1') },
      activeFallbackId: null,
      hasOver: true,
      overId: 'trash',
      snapshot: makeContainerSnapshot(),
      tierIds: ['tier-s', 'tier-a', 'tier-b'],
    })

    expect(result).toEqual({ kind: 'item-trash', itemId: 'item-1' })
  })

  it('requests rendered-order resync for same-container item commits', () =>
  {
    const result = resolveDragEndDecision({
      activeDrag: { kind: 'item', itemId: asItemId('item-1') },
      activeFallbackId: null,
      hasOver: true,
      overId: 'item-2',
      snapshot: makeContainerSnapshot(),
      tierIds: ['tier-s', 'tier-a', 'tier-b'],
    })

    expect(result).toEqual({
      kind: 'item-commit',
      itemId: 'item-1',
      resyncContainerId: 'tier-s',
    })
  })

  it('commits without resync when the over target is not in the snapshot', () =>
  {
    const result = resolveDragEndDecision({
      activeDrag: { kind: 'item', itemId: asItemId('item-1') },
      activeFallbackId: null,
      hasOver: true,
      overId: 'missing',
      snapshot: makeContainerSnapshot(),
      tierIds: ['tier-s', 'tier-a', 'tier-b'],
    })

    expect(result).toEqual({
      kind: 'item-commit',
      itemId: 'item-1',
      resyncContainerId: null,
    })
  })
})
