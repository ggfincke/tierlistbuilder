// tests/sharing/hashShare.test.ts
// snapshot codec: round-trip, image stripping, malformed-input rejection

import { describe, it, expect } from 'vitest'
import {
  compressSnapshotBytes,
  decodeBoardFromShareFragment,
  encodeBoardToShareFragment,
  inflateSnapshotBytes,
  stripImagesForShare,
} from '~/shared/sharing/hashShare'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeTier } from '../fixtures'

describe('snapshot codec', () =>
{
  it('round-trips a board through compress/inflate & encode/decodeBoardFromShareFragment', async () =>
  {
    const original = makeBoardSnapshot({
      title: 'My Board',
      tiers: [makeTier({ id: 'tier-s', itemIds: [asItemId('a')] })],
      items: { [asItemId('a')]: { id: asItemId('a'), label: 'Hello' } },
    })

    const decoded = await inflateSnapshotBytes(
      await compressSnapshotBytes(original)
    )
    expect(decoded.title).toBe('My Board')
    expect(decoded.tiers[0].itemIds).toEqual(['a'])

    const fragment = await encodeBoardToShareFragment(original)
    const fromFragment = await decodeBoardFromShareFragment(fragment)
    expect(fromFragment.title).toBe('My Board')
    expect(fromFragment.tiers[0].id).toBe('tier-s')
  })

  it('strips image refs & deletedItems from shared payloads', () =>
  {
    const stripped = stripImagesForShare(
      makeBoardSnapshot({
        items: {
          [asItemId('a')]: {
            id: asItemId('a'),
            label: 'x',
            imageRef: { hash: 'img-1' },
            sourceImageRef: { hash: 'source-1' },
          },
        },
        deletedItems: [{ id: asItemId('d'), label: 'deleted' }],
      })
    )
    expect(stripped.items[asItemId('a')]).not.toHaveProperty('imageRef')
    expect(stripped.items[asItemId('a')]).not.toHaveProperty('sourceImageRef')
    expect(stripped.deletedItems).toEqual([])
  })

  it('throws on malformed compressed bytes', async () =>
  {
    await expect(
      inflateSnapshotBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
    ).rejects.toThrow()
  })
})
