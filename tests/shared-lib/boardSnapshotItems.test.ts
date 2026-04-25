// tests/shared-lib/boardSnapshotItems.test.ts
// board snapshot image hash collection

import { describe, expect, it } from 'vitest'

import {
  collectSnapshotImageHashes,
  collectSnapshotLocalImageHashes,
  transformSnapshotItemsAsync,
} from '~/shared/lib/boardSnapshotItems'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem } from '../fixtures'

describe('board snapshot image hash collection', () =>
{
  it('keeps source image hashes local-only', () =>
  {
    const id = asItemId('item-image')
    const snapshot = makeBoardSnapshot({
      items: {
        [id]: makeItem({
          id,
          imageRef: { hash: 'thumb-hash' },
          sourceImageRef: { hash: 'source-hash' },
        }),
      },
    })

    expect(collectSnapshotImageHashes(snapshot)).toEqual(['thumb-hash'])
    expect(collectSnapshotLocalImageHashes(snapshot)).toEqual([
      'thumb-hash',
      'source-hash',
    ])
  })

  it('maps live and deleted items while preserving each output order', async () =>
  {
    const firstId = asItemId('item-first')
    const secondId = asItemId('item-second')
    const deletedId = asItemId('item-deleted')
    const snapshot = makeBoardSnapshot({
      items: {
        [firstId]: makeItem({ id: firstId, label: 'First' }),
        [secondId]: makeItem({ id: secondId, label: 'Second' }),
      },
      deletedItems: [makeItem({ id: deletedId, label: 'Deleted' })],
    })

    const result = await transformSnapshotItemsAsync(
      snapshot,
      1,
      async (item, id) => `${id ?? 'deleted'}:${item.label ?? ''}`
    )

    expect(result.items).toEqual({
      [firstId]: 'item-first:First',
      [secondId]: 'item-second:Second',
    })
    expect(result.deletedItems).toEqual(['deleted:Deleted'])
  })
})
