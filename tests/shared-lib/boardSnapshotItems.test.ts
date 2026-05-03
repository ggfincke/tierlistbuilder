// tests/shared-lib/boardSnapshotItems.test.ts
// board snapshot image hash collection

import { describe, expect, it } from 'vitest'

import {
  collectSnapshotExportImageHashes,
  collectSnapshotLocalImageHashes,
  collectSnapshotRenderImageHashes,
  transformSnapshotItemsAsync,
} from '~/shared/lib/boardSnapshotItems'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem } from '../fixtures'

describe('board snapshot image hash collection', () =>
{
  it('collects export, render, & local image hashes by rendition role', () =>
  {
    const id = asItemId('item-image')
    const snapshot = makeBoardSnapshot({
      items: {
        [id]: makeItem({
          id,
          imageRef: { hash: 'thumb-hash' },
          tileImageRef: { hash: 'tile-hash' },
          sourceImageRef: { hash: 'source-hash' },
        }),
      },
    })

    expect(collectSnapshotExportImageHashes(snapshot)).toEqual([
      'source-hash',
      'tile-hash',
      'thumb-hash',
    ])
    expect(collectSnapshotRenderImageHashes(snapshot)).toEqual([])
    expect(collectSnapshotLocalImageHashes(snapshot)).toEqual([
      'thumb-hash',
      'tile-hash',
      'source-hash',
    ])
  })

  it('warms tile images first for visible board rendering', () =>
  {
    const id = asItemId('item-image')
    const sourceOnlyId = asItemId('item-source-only')
    const snapshot = makeBoardSnapshot({
      items: {
        [id]: makeItem({
          id,
          imageRef: { hash: 'thumb-hash' },
          tileImageRef: { hash: 'tile-hash' },
          sourceImageRef: { hash: 'source-hash' },
        }),
        [sourceOnlyId]: makeItem({
          id: sourceOnlyId,
          imageRef: { hash: 'fallback-thumb-hash' },
          sourceImageRef: { hash: 'fallback-source-hash' },
        }),
      },
      unrankedItemIds: [id, sourceOnlyId],
    })

    expect(collectSnapshotRenderImageHashes(snapshot)).toEqual([
      'tile-hash',
      'thumb-hash',
      'fallback-source-hash',
      'fallback-thumb-hash',
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
