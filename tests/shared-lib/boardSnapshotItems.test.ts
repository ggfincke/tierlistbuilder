// tests/shared-lib/boardSnapshotItems.test.ts
// board snapshot image hash collection

import { describe, expect, it } from 'vitest'

import {
  collectSnapshotImageHashes,
  collectSnapshotLocalImageHashes,
  collectSnapshotRenderImageHashes,
  collectSnapshotRenderImageRefs,
} from '~/shared/lib/boardSnapshotItems'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'

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

  it('collects source image refs only when transforms render from them', () =>
  {
    const transformedId = asItemId('item-transformed')
    const plainId = asItemId('item-plain')
    const snapshot = makeBoardSnapshot({
      tiers: [
        makeTier({
          itemIds: [transformedId, plainId],
        }),
      ],
      items: {
        [transformedId]: makeItem({
          id: transformedId,
          imageRef: { hash: 'thumb-hash', cloudMediaExternalId: 'cloud-a' },
          sourceImageRef: {
            hash: 'source-hash',
            cloudMediaExternalId: 'cloud-source',
          },
          transform: { rotation: 0, zoom: 1.2, offsetX: 0, offsetY: 0 },
        }),
        [plainId]: makeItem({
          id: plainId,
          imageRef: { hash: 'plain-hash', cloudMediaExternalId: 'cloud-b' },
          sourceImageRef: { hash: 'unused-source-hash' },
        }),
      },
    })

    expect(collectSnapshotRenderImageHashes(snapshot)).toEqual([
      'thumb-hash',
      'source-hash',
      'plain-hash',
    ])
    expect(collectSnapshotRenderImageRefs(snapshot)).toEqual([
      { hash: 'thumb-hash', cloudMediaExternalId: 'cloud-a' },
      { hash: 'source-hash', cloudMediaExternalId: 'cloud-source' },
      { hash: 'plain-hash', cloudMediaExternalId: 'cloud-b' },
    ])
  })
})
