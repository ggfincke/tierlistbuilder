// tests/dnd/dragEndDecision.test.ts
// pure pointer drag-end decision rules

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { resolveDragEndDecision } from '~/features/workspace/boards/dnd/dragEndDecision'
import { makeContainerSnapshot } from '../fixtures'

const TIER_IDS = ['tier-s', 'tier-a', 'tier-b']

describe('resolveDragEndDecision', () =>
{
  it('classifies tier reorder, item cancel, trash, & item-commit (resync vs no-resync)', () =>
  {
    const snapshot = makeContainerSnapshot()

    expect(
      resolveDragEndDecision({
        activeDrag: { kind: 'tier', tierId: 'tier-s' },
        activeFallbackId: null,
        hasOver: true,
        overId: 'tier-a',
        snapshot,
        tierIds: TIER_IDS,
      })
    ).toEqual({ kind: 'tier-reorder', fromIndex: 0, toIndex: 1 })

    expect(
      resolveDragEndDecision({
        activeDrag: { kind: 'item', itemId: asItemId('item-1') },
        activeFallbackId: null,
        hasOver: false,
        overId: null,
        snapshot,
        tierIds: TIER_IDS,
      })
    ).toEqual({ kind: 'item-cancel', itemId: 'item-1' })

    expect(
      resolveDragEndDecision({
        activeDrag: { kind: 'item', itemId: asItemId('item-1') },
        activeFallbackId: null,
        hasOver: true,
        overId: 'trash',
        snapshot,
        tierIds: TIER_IDS,
      })
    ).toEqual({ kind: 'item-trash', itemId: 'item-1' })

    expect(
      resolveDragEndDecision({
        activeDrag: { kind: 'item', itemId: asItemId('item-1') },
        activeFallbackId: null,
        hasOver: true,
        overId: 'item-2',
        snapshot,
        tierIds: TIER_IDS,
      })
    ).toEqual({
      kind: 'item-commit',
      itemId: 'item-1',
      resyncContainerId: 'tier-s',
    })

    expect(
      resolveDragEndDecision({
        activeDrag: { kind: 'item', itemId: asItemId('item-1') },
        activeFallbackId: null,
        hasOver: true,
        overId: 'missing',
        snapshot,
        tierIds: TIER_IDS,
      })
    ).toEqual({
      kind: 'item-commit',
      itemId: 'item-1',
      resyncContainerId: null,
    })
  })
})
