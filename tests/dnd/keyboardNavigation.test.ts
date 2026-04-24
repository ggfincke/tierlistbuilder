// tests/dnd/keyboardNavigation.test.ts
// pure browse & dragging keyboard navigation resolution

import { describe, expect, it } from 'vitest'

import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  resolveBrowseKeyboardNavigation,
  resolveDraggingKeyboardNavigation,
} from '~/features/workspace/boards/interaction/keyboardNavigation'
import type { RenderedRowLayout } from '~/features/workspace/boards/dnd/dragLayoutRows'
import {
  brandItemIds as ids,
  findTierById,
  makeContainerSnapshot,
} from '../fixtures'

const getRowLayout =
  (layouts: Record<string, RenderedRowLayout>) => (containerId: string) =>
    layouts[containerId] ?? null

describe('resolveBrowseKeyboardNavigation', () =>
{
  it('uses rendered rows for vertical focus movement in one container', () =>
  {
    const result = resolveBrowseKeyboardNavigation({
      snapshot: makeContainerSnapshot(),
      itemId: asItemId('item-2'),
      focusedItemId: asItemId('item-2'),
      direction: 'ArrowDown',
      getRowLayout: getRowLayout({
        'tier-s': {
          rows: [ids('item-1', 'item-2'), ids('item-3')],
          rowCount: 2,
        },
      }),
    })

    expect(result).toBe('item-3')
  })

  it('preserves source column when crossing into a rendered target row', () =>
  {
    const snapshot = makeContainerSnapshot({
      tiers: [
        { id: 'tier-s', itemIds: ids('item-1', 'item-2') },
        { id: 'tier-a', itemIds: ids('item-3', 'item-4', 'item-5') },
        { id: 'tier-b', itemIds: [] },
      ],
    })
    const result = resolveBrowseKeyboardNavigation({
      snapshot,
      itemId: asItemId('item-2'),
      focusedItemId: asItemId('item-2'),
      direction: 'ArrowDown',
      getRowLayout: getRowLayout({
        'tier-s': { rows: [ids('item-1', 'item-2')], rowCount: 1 },
        'tier-a': {
          rows: [ids('item-3'), ids('item-4', 'item-5')],
          rowCount: 2,
        },
      }),
    })

    expect(result).toBe('item-3')
  })
})

describe('resolveDraggingKeyboardNavigation', () =>
{
  it('returns a preview for rendered vertical moves in one container', () =>
  {
    const result = resolveDraggingKeyboardNavigation({
      snapshot: makeContainerSnapshot(),
      itemId: asItemId('item-2'),
      direction: 'ArrowDown',
      getRowLayout: getRowLayout({
        'tier-s': {
          rows: [ids('item-1', 'item-2'), ids('item-3')],
          rowCount: 2,
        },
      }),
    })

    expect(result.kind).toBe('move')
    if (result.kind !== 'move') return
    expect(findTierById(result.nextPreview.tiers, 'tier-s').itemIds).toEqual([
      'item-1',
      'item-3',
      'item-2',
    ])
  })

  it('reports missing active items so the controller can cancel safely', () =>
  {
    const result = resolveDraggingKeyboardNavigation({
      snapshot: makeContainerSnapshot(),
      itemId: asItemId('missing'),
      direction: 'ArrowDown',
    })

    expect(result).toEqual({ kind: 'missing-active' })
  })
})
