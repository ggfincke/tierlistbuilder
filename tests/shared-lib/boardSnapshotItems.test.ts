// tests/shared-lib/boardSnapshotItems.test.ts
// board snapshot image hash collection

import { describe, expect, it } from 'vitest'

import {
  collectSnapshotImageHashes,
  collectSnapshotLocalImageHashes,
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
})
