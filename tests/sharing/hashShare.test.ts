// tests/sharing/hashShare.test.ts
// snapshot codec: round-trip, image stripping, oversize rejection

import { describe, it, expect } from 'vitest'
import {
  compressSnapshotBytes,
  decodeBoardFromShareFragment,
  encodeBoardToShareFragment,
  inflateSnapshotBytes,
  stripImagesForShare,
} from '~/features/workspace/sharing/snapshot-compression/hashShare'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeTier } from '../fixtures'

describe('snapshot codec', () =>
{
  it('round-trips a board snapshot through compress -> inflate', async () =>
  {
    const original = makeBoardSnapshot({
      title: 'My Board',
      tiers: [makeTier({ id: 'tier-s', itemIds: [asItemId('a')] })],
      items: {
        [asItemId('a')]: { id: asItemId('a'), label: 'Hello' },
      },
    })

    const bytes = await compressSnapshotBytes(original)
    const decoded = await inflateSnapshotBytes(bytes)

    expect(decoded.title).toBe('My Board')
    expect(decoded.tiers).toHaveLength(1)
    expect(decoded.tiers[0].itemIds).toEqual(['a'])
    expect(decoded.items['a']?.label).toBe('Hello')
  })

  it('strips image refs & deletedItems from shared payloads', () =>
  {
    const snapshot = makeBoardSnapshot({
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

    const stripped = stripImagesForShare(snapshot)
    const item = stripped.items[asItemId('a')]
    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('imageRef')
    expect(item).not.toHaveProperty('sourceImageRef')
    expect(stripped.deletedItems).toEqual([])
  })

  it('keeps image-only items renderable after stripping image refs', async () =>
  {
    const plainImageId = asItemId('plain-image')
    const altImageId = asItemId('alt-image')
    const original = makeBoardSnapshot({
      title: 'Images Only',
      tiers: [makeTier({ id: 'tier-s', itemIds: [plainImageId, altImageId] })],
      items: {
        [plainImageId]: {
          id: plainImageId,
          imageRef: { hash: 'img-1' },
        },
        [altImageId]: {
          id: altImageId,
          imageRef: { hash: 'img-2' },
          sourceImageRef: { hash: 'source-2' },
          altText: 'Cover art',
        },
      },
    })

    const decoded = await decodeBoardFromShareFragment(
      await encodeBoardToShareFragment(original)
    )
    const plainImage = decoded.items[plainImageId]
    const altImage = decoded.items[altImageId]

    expect(plainImage?.label).toBe('Image')
    expect(plainImage).not.toHaveProperty('imageRef')
    expect(altImage?.label).toBe('Cover art')
    expect(altImage).not.toHaveProperty('sourceImageRef')
    expect(decoded.tiers[0].itemIds).toEqual([plainImageId, altImageId])
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

  it('decodes current share fragments', async () =>
  {
    const original = makeBoardSnapshot({
      title: 'Current Fragment',
      tiers: [makeTier({ id: 'tier-s' })],
    })

    const fragment = await encodeBoardToShareFragment(original)
    const decoded = await decodeBoardFromShareFragment(fragment)

    expect(decoded.title).toBe('Current Fragment')
    expect(decoded.tiers[0].id).toBe('tier-s')
  })
})
