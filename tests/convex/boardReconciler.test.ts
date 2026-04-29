// tests/data/boardReconciler.test.ts
// cloud board diffing helpers

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

describe('boardReconciler media semantics', () =>
{
  it('preserves existing media when the wire item omits mediaExternalId', () =>
  {
    const diff = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          order: 1,
        },
      ],
      [makeServerItem()],
      new Map(),
      new Map(),
      new Set()
    )

    expect(diff.patch).toEqual([
      {
        id: 'row-1',
        fields: {
          order: 1,
        },
      },
    ])
  })

  it('clears media when the wire item explicitly sends mediaExternalId null', () =>
  {
    const diff = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          mediaExternalId: null,
          order: 0,
        },
      ],
      [makeServerItem()],
      new Map(),
      new Map(),
      new Set()
    )

    expect(diff.patch).toEqual([
      {
        id: 'row-1',
        fields: {
          mediaAssetId: null,
        },
      },
    ])
  })

  it('updates source media independently from display media', () =>
  {
    const diff = diffItems(
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

    expect(diff.patch).toEqual([
      {
        id: 'row-1',
        fields: {
          sourceMediaAssetId: SOURCE_MEDIA_ID,
        },
      },
    ])
  })

  it('clears source media when explicitly sent as null', () =>
  {
    const diff = diffItems(
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

    expect(diff.patch).toEqual([
      {
        id: 'row-1',
        fields: {
          sourceMediaAssetId: null,
        },
      },
    ])
  })

  it('preserves existing media when restoring a deleted item without a media field', () =>
  {
    const diff = diffItems(
      [
        {
          externalId: 'item-1',
          tierId: null,
          order: 4,
        },
      ],
      [makeServerItem({ deletedAt: 123 })],
      new Map(),
      new Map(),
      new Set()
    )

    expect(diff.patch).toEqual([
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

  it('patches existing items when only label font size changes', () =>
  {
    const diff = diffItems(
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

    expect(diff.patch).toEqual([
      {
        id: 'row-1',
        fields: {
          labelOptions: { fontSizePx: 18 },
        },
      },
    ])
  })
})
