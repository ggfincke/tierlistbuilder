// tests/sharing/hashShare.test.ts
// snapshot codec: round-trip, image stripping, oversize rejection

import { describe, it, expect } from 'vitest'
import {
  ShareFragmentDecodeError,
  compressSnapshotBytes,
  decodeBoardFromShareFragment,
  encodeBoardToShareFragment,
  inflateSnapshotBytes,
  isShareFragmentDecodeError,
  stripImagesForShare,
} from '~/shared/sharing/hashShare'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { bytesToBase64Url } from '~/shared/lib/binaryCodec'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeTier } from '@tests/fixtures'

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
    expect(decoded.items[asItemId('a')]?.label).toBe('Hello')
  })

  it('strips image refs & deletedItems from shared payloads', () =>
  {
    const snapshot = makeBoardSnapshot({
      items: {
        [asItemId('a')]: {
          id: asItemId('a'),
          label: 'x',
          notes: 'private rationale',
          imageRef: { hash: 'img-1' },
          tileImageRef: { hash: 'tile-1' },
          sourceImageRef: { hash: 'source-1' },
        },
      },
      deletedItems: [{ id: asItemId('d'), label: 'deleted' }],
    })

    const stripped = stripImagesForShare(snapshot)
    const item = stripped.items[asItemId('a')]
    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('imageRef')
    expect(item).not.toHaveProperty('tileImageRef')
    expect(item).not.toHaveProperty('sourceImageRef')
    expect(item).not.toHaveProperty('notes')
    expect(stripped.deletedItems).toEqual([])
  })

  it('strips private notes from shared payloads', async () =>
  {
    const id = asItemId('item-private')
    const original = makeBoardSnapshot({
      title: 'Private Notes',
      tiers: [makeTier({ id: 'tier-s', itemIds: [id] })],
      items: {
        [id]: {
          id,
          label: 'Visible label',
          notes: 'Only I should see this',
        },
      },
    })

    const stripped = stripImagesForShare(original)
    expect(stripped.items[id]).not.toHaveProperty('notes')

    const decoded = await decodeBoardFromShareFragment(
      await encodeBoardToShareFragment(original)
    )
    expect(decoded.items[id]).not.toHaveProperty('notes')
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
          tileImageRef: { hash: 'tile-2' },
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
    expect(altImage).not.toHaveProperty('tileImageRef')
    expect(altImage).not.toHaveProperty('sourceImageRef')
    expect(decoded.tiers[0].itemIds).toEqual([plainImageId, altImageId])
  })

  it('throws on malformed compressed bytes', async () =>
  {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await expect(inflateSnapshotBytes(garbage)).rejects.toThrow()
  })

  it('classifies empty, corrupt, and oversized share fragments', async () =>
  {
    await expect(decodeBoardFromShareFragment('')).rejects.toMatchObject({
      kind: 'empty',
    })

    await expect(decodeBoardFromShareFragment('@@@')).rejects.toMatchObject({
      kind: 'invalid',
    })

    const oversized = bytesToBase64Url(
      new Uint8Array(MAX_SNAPSHOT_COMPRESSED_BYTES + 1)
    )
    await expect(decodeBoardFromShareFragment(oversized)).rejects.toMatchObject(
      {
        kind: 'too-large',
      }
    )
  })

  it('exposes a type guard for share-fragment decode errors', () =>
  {
    const error = new ShareFragmentDecodeError('invalid', 'bad share')
    expect(isShareFragmentDecodeError(error)).toBe(true)
    expect(isShareFragmentDecodeError(new Error('bad share'))).toBe(false)
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
