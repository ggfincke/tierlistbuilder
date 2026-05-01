// tests/convex/boardReconciler.test.ts
// cloud board diffing: media preservation, clear semantics, & label patching

import { describe, expect, it } from 'vitest'
import type { Id } from '@convex/_generated/dataModel'
import type { ItemLabelOptions } from '@tierlistbuilder/contracts/workspace/board'
import { diffItems } from '../../convex/workspace/sync/boardReconciler'

const MEDIA_ID = 'media-1' as Id<'mediaAssets'>
const SOURCE_MEDIA_ID = 'media-source' as Id<'mediaAssets'>

const makeServerItem = (
  overrides: Partial<{
    mediaAssetId: Id<'mediaAssets'> | null
    sourceMediaAssetId: Id<'mediaAssets'> | null
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
  sourceMediaAssetId: null,
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

  it('treats source media independently from display media & patches label-only edits', () =>
  {
    const sourceSet = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          sourceMediaExternalId: 'media-source',
          order: 0,
        },
      ],
      [makeServerItem()],
      new Map(),
      new Map([['media-source', SOURCE_MEDIA_ID]]),
      new Set()
    )
    expect(sourceSet.patch).toEqual([
      { id: 'row-1', fields: { sourceMediaAssetId: SOURCE_MEDIA_ID } },
    ])

    const sourceClear = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          sourceMediaExternalId: null,
          order: 0,
        },
      ],
      [makeServerItem({ sourceMediaAssetId: SOURCE_MEDIA_ID })],
      new Map(),
      new Map(),
      new Set()
    )
    expect(sourceClear.patch).toEqual([
      { id: 'row-1', fields: { sourceMediaAssetId: null } },
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
