// tests/convex/boardReconciler.test.ts
// cloud board diffing: media preservation, clear semantics, & label patching

import { describe, expect, it } from 'vitest'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { diffItems } from '../../convex/workspace/sync/boardReconciler'

const MEDIA_ID = 'media-1' as Id<'mediaAssets'>

const makeServerItem = (
  overrides: Partial<Doc<'boardItems'>> = {}
): Doc<'boardItems'> => ({
  _id: 'row-1' as Id<'boardItems'>,
  _creationTime: 0,
  boardId: 'board-1' as Id<'boards'>,
  tierId: null,
  externalId: 'item-1',
  label: undefined,
  backgroundColor: undefined,
  altText: undefined,
  mediaAssetId: MEDIA_ID,
  order: 0,
  deletedAt: null,
  ...overrides,
})

describe('diffItems media semantics', () =>
{
  it('preserves media on omit, clears on explicit null, & restores deleted items', () =>
  {
    const omit = diffItems(
      [{ externalId: 'item-1', tierId: null, order: 1 }],
      [makeServerItem()],
      new Map(),
      new Map(),
      new Set()
    )
    expect(omit.patch).toEqual([{ id: 'row-1', fields: { order: 1 } }])

    const clear = diffItems(
      [{ externalId: 'item-1', tierId: null, mediaExternalId: null, order: 0 }],
      [makeServerItem()],
      new Map(),
      new Map(),
      new Set()
    )
    expect(clear.patch).toEqual([
      { id: 'row-1', fields: { mediaAssetId: null } },
    ])

    const restored = diffItems(
      [{ externalId: 'item-1', tierId: null, order: 4 }],
      [makeServerItem({ deletedAt: 123 })],
      new Map(),
      new Map(),
      new Set()
    )
    expect(restored.patch).toEqual([
      {
        id: 'row-1',
        fields: {
          deletedAt: null,
          tierId: null,
          order: 4,
          label: undefined,
          backgroundColor: undefined,
          altText: undefined,
          notes: undefined,
          aspectRatio: undefined,
          imageFit: undefined,
          transform: undefined,
          labelOptions: undefined,
        },
      },
    ])
  })

  it('preserves pending item fields when soft-deleting a synced item', () =>
  {
    const diff = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          order: 0,
          label: 'Edited label',
          backgroundColor: '#111827',
          altText: 'Edited alt text',
          notes: 'Private note edited before delete',
        },
      ],
      [
        makeServerItem({
          label: 'Old label',
          backgroundColor: undefined,
          altText: 'Old alt text',
          notes: 'Old note',
        }),
      ],
      new Map(),
      new Map(),
      new Set(['item-1'])
    )

    expect(diff.patch).toEqual([])
    expect(diff.softDelete).toHaveLength(1)
    expect(diff.softDelete[0]).toMatchObject({
      id: 'row-1',
      deletedAt: expect.any(Number),
      fields: {
        label: 'Edited label',
        backgroundColor: '#111827',
        altText: 'Edited alt text',
        notes: 'Private note edited before delete',
      },
    })
  })

  it('patches display media changes & label-only edits', () =>
  {
    const mediaSet = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          mediaExternalId: 'media-2',
          order: 0,
        },
      ],
      [makeServerItem()],
      new Map(),
      new Map([['media-2', 'media-2' as Id<'mediaAssets'>]]),
      new Set()
    )
    expect(mediaSet.patch).toEqual([
      { id: 'row-1', fields: { mediaAssetId: 'media-2' } },
    ])

    const labelPatch = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          order: 0,
          labelOptions: { fontSizePx: 18 },
        },
      ],
      [makeServerItem({ labelOptions: { fontSizePx: 12 } })],
      new Map(),
      new Map(),
      new Set()
    )
    expect(labelPatch.patch).toEqual([
      { id: 'row-1', fields: { labelOptions: { fontSizePx: 18 } } },
    ])
  })
})
