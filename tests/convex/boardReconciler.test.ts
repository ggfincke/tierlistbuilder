// tests/convex/boardReconciler.test.ts
// cloud board diffing: media preservation, clear semantics, & label patching

import { describe, expect, it } from 'vitest'
import type { Id } from '@convex/_generated/dataModel'
import type { ItemLabelOptions } from '@tierlistbuilder/contracts/workspace/board'
import { diffItems } from '../../convex/workspace/sync/boardReconciler'

const MEDIA_ID = 'media-1' as Id<'mediaAssets'>

const makeServerItem = (
  overrides: Partial<{
    mediaAssetId: Id<'mediaAssets'> | null
    order: number
    deletedAt: number | null
    labelOptions: ItemLabelOptions
  }> = {}
) => ({
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
        },
      },
    ])
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
