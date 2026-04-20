// tests/sharing/hashShare.test.ts
// share-fragment codec: round-trip, image stripping, oversize rejection

import { describe, it, expect } from 'vitest'
import {
  compressSnapshotBytes,
  inflateSnapshotBytes,
  encodeBoardToShareFragment,
  decodeBoardFromShareFragment,
  stripImagesForShare,
} from '~/features/workspace/sharing/snapshot-compression/hashShare'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeTier } from '../fixtures'

describe('hashShare codec', () =>
{
  it('round-trips a board snapshot through encode -> decode', async () =>
  {
    const original = makeBoardSnapshot({
      title: 'My Board',
      tiers: [makeTier({ id: 'tier-s', itemIds: [asItemId('a')] })],
      items: {
        [asItemId('a')]: { id: asItemId('a'), label: 'Hello' },
      },
    })

    const fragment = await encodeBoardToShareFragment(original)
    const decoded = await decodeBoardFromShareFragment(fragment)

    expect(decoded.title).toBe('My Board')
    expect(decoded.tiers).toHaveLength(1)
    expect(decoded.tiers[0].itemIds).toEqual(['a'])
    expect(decoded.items['a']?.label).toBe('Hello')
  })

  it('strips imageRef, imageUrl, & deletedItems from shared payloads', () =>
  {
    const snapshot = makeBoardSnapshot({
      items: {
        [asItemId('a')]: {
          id: asItemId('a'),
          label: 'x',
          imageRef: 'img-1',
          imageUrl: 'data:image/png;base64,AAAA',
        },
      },
      deletedItems: [{ id: asItemId('d'), label: 'deleted' }],
    })

    const stripped = stripImagesForShare(snapshot)
    const item = stripped.items[asItemId('a')]
    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('imageRef')
    expect(item).not.toHaveProperty('imageUrl')
    expect(stripped.deletedItems).toEqual([])
  })

  it('throws on malformed compressed bytes', async () =>
  {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await expect(inflateSnapshotBytes(garbage)).rejects.toThrow()
  })

  it('round-trips compressSnapshotBytes -> inflateSnapshotBytes at the byte layer', async () =>
  {
    const original = makeBoardSnapshot({
      title: 'Bytes Test',
      tiers: [makeTier({ id: 'tier-s' })],
    })
    const bytes = await compressSnapshotBytes(original)
    expect(bytes.byteLength).toBeGreaterThan(0)
    const decoded = await inflateSnapshotBytes(bytes)
    expect(decoded.title).toBe('Bytes Test')
  })
})
