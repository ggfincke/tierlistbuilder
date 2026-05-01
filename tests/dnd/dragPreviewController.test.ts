// tests/dnd/dragPreviewController.test.ts
// queued pointer preview reconciliation

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { syncDraggedItemPosition } from '~/features/workspace/boards/dnd/dragPreviewController'
import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { brandItemIds as ids, findTierById, makeRect } from '../fixtures'

describe('syncDraggedItemPosition', () =>
{
  it('computes from the supplied preview so same-frame pointer moves replace queued state', () =>
  {
    const queuedPreview: ContainerSnapshot = {
      tiers: [
        { id: 'tier-s', itemIds: ids('item-2', 'item-1', 'item-3') },
        { id: 'tier-a', itemIds: ids('item-4', 'item-5') },
      ],
      unrankedItemIds: ids('item-6'),
    }
    const movedToNewContainerRef = { current: false }
    let nextPreview: ContainerSnapshot | null = null

    const synced = syncDraggedItemPosition(
      {
        active: {
          id: asItemId('item-1'),
          rect: {
            current: {
              initial: null,
              translated: makeRect({ left: 0, width: 40, height: 40 }),
            },
          },
        },
        over: {
          id: asItemId('item-2'),
          rect: makeRect({ left: 100, width: 40, height: 40 }),
        },
        delta: { x: 0, y: 0 },
      } as Parameters<typeof syncDraggedItemPosition>[0],
      queuedPreview,
      movedToNewContainerRef,
      (preview) =>
      {
        nextPreview = preview
      }
    )

    expect(synced).toBe(true)
    expect(movedToNewContainerRef.current).toBe(false)
    expect(nextPreview).not.toBeNull()
    expect(findTierById(nextPreview!.tiers, 'tier-s').itemIds).toEqual([
      'item-1',
      'item-2',
      'item-3',
    ])
  })
})
