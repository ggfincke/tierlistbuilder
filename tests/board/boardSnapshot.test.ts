// tests/board/boardSnapshot.test.ts
// board snapshot creation & normalization helpers

import { describe, it, expect } from 'vitest'
import {
  boardDataFieldsEqual,
  createInitialBoardData,
  createNewTier,
  extractBoardData,
  resetBoardData,
  normalizeBoardSnapshot,
} from '~/shared/board-data/boardSnapshot'
import { normalizeCanonicalTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'
import { asInvalid } from '../typeHelpers'

describe('createInitialBoardData', () =>
{
  it('creates a board w/ default title, 6 empty tiers, & no items', () =>
  {
    const data = createInitialBoardData('classic')
    expect(data.title).toBe('My Tier List')
    expect(data.tiers).toHaveLength(6)
    expect(data.tiers.map((t) => t.name)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    for (const tier of data.tiers)
    {
      expect(tier.itemIds).toEqual([])
    }
    expect(data.items).toEqual({})
    expect(data.deletedItems).toEqual([])
    expect(data.unrankedItemIds).toEqual([])
  })
})

describe('resetBoardData', () =>
{
  it('moves all items to unranked, resets tiers, & preserves title', () =>
  {
    const state = makeBoardSnapshot({
      title: 'Custom Title',
      tiers: [
        makeTier({
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom', hex: '#ff0000' },
          itemIds: [asItemId('a'), asItemId('b')],
        }),
        makeTier({
          id: 'tier-a',
          name: 'A',
          colorSpec: { kind: 'custom', hex: '#00ff00' },
          itemIds: [asItemId('c')],
        }),
      ],
      unrankedItemIds: [asItemId('d')],
      items: {
        [asItemId('a')]: makeItem({ id: asItemId('a') }),
        [asItemId('b')]: makeItem({ id: asItemId('b') }),
        [asItemId('c')]: makeItem({ id: asItemId('c') }),
        [asItemId('d')]: makeItem({ id: asItemId('d') }),
      },
    })

    const result = resetBoardData(state, 'classic')
    expect(result.title).toBe('Custom Title')
    expect(result.tiers).toHaveLength(6)
    expect(result.unrankedItemIds).toEqual(['a', 'b', 'c', 'd'])
    for (const tier of result.tiers)
    {
      expect(tier.itemIds).toEqual([])
    }
  })
})

describe('board data projection', () =>
{
  it('extracts only persisted board fields from runtime state', () =>
  {
    const board = makeBoardSnapshot({
      sourceTemplateId: 'Template123',
      sourceTemplateTitle: 'Template',
      sourceTemplateCoverMedia: {
        externalId: 'cover',
        contentHash: 'hash-cover',
        url: 'https://cdn.test/cover.jpg',
        width: 1200,
        height: 800,
        mimeType: 'image/jpeg',
      },
      sourceTemplateCoverFraming: {
        browseHero: null,
        detailHero: null,
        card: { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
      },
      preferredCriterionExternalId: 'favorites',
    })
    const state = {
      ...board,
      runtimeError: 'ignored',
    }

    const snapshot = extractBoardData(state)

    expect(snapshot).not.toHaveProperty('runtimeError')
    expect(snapshot.sourceTemplateCoverMedia?.externalId).toBe('cover')
    expect(snapshot.sourceTemplateCoverFraming?.card).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.8,
      height: 0.5,
    })
    expect(boardDataFieldsEqual(state, { ...state, runtimeError: null })).toBe(
      true
    )
    expect(boardDataFieldsEqual(state, { ...state, title: 'Changed' })).toBe(
      false
    )
  })
})

describe('normalizeBoardSnapshot', () =>
{
  it('returns valid defaults for null input', () =>
  {
    const data = normalizeBoardSnapshot(null, 'classic')
    expect(data.title).toBe('My Tier List')
    expect(data.tiers).toHaveLength(6)
    expect(data.items).toEqual({})
  })

  it('preserves image rendition refs & drops identity transforms', () =>
  {
    const id = asItemId('item-image')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        items: {
          [id]: makeItem({
            id,
            imageRef: {
              hash: 'thumb-hash',
              cloudMediaExternalId: 'media-thumb',
              cloudMediaOwnership: 'source',
            },
            tileImageRef: {
              hash: 'tile-hash',
              cloudMediaExternalId: 'media-tile',
            },
            sourceImageRef: { hash: 'source-hash' },
            transform: { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 },
            sourceTemplateItemExternalId: 'template-item-1',
          }),
        },
      }),
      'classic'
    )

    expect(result.items[id].imageRef).toEqual({
      hash: 'thumb-hash',
      cloudMediaExternalId: 'media-thumb',
      cloudMediaOwnership: 'source',
    })
    expect(result.items[id].tileImageRef).toEqual({
      hash: 'tile-hash',
      cloudMediaExternalId: 'media-tile',
    })
    expect(result.items[id].sourceImageRef).toEqual({ hash: 'source-hash' })
    expect(result.items[id].sourceTemplateItemExternalId).toBe(
      'template-item-1'
    )
    expect(result.items[id].transform).toBeUndefined()
  })

  it('preserves source board metadata through normalization', () =>
  {
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        sourceTemplateId: 'Template123',
        sourceRankingId: 'Ranking123',
        sourceTemplateTitle: 'Template',
        sourceRankingTitle: 'Ranking',
        sourceTemplateCoverMedia: {
          externalId: 'cover',
          contentHash: 'hash-cover',
          url: 'https://cdn.test/cover.jpg',
          width: 1920,
          height: 1080,
          mimeType: 'image/jpeg',
        },
        sourceTemplateCoverFraming: {
          browseHero: null,
          detailHero: null,
          card: { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
        },
        preferredCriterionExternalId: 'favorites',
      }),
      'classic'
    )

    expect(result).toMatchObject({
      sourceTemplateId: 'Template123',
      sourceRankingId: 'Ranking123',
      sourceTemplateTitle: 'Template',
      sourceRankingTitle: 'Ranking',
      sourceTemplateCoverMedia: {
        externalId: 'cover',
        contentHash: 'hash-cover',
      },
      sourceTemplateCoverFraming: {
        card: { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
      },
      preferredCriterionExternalId: 'favorites',
    })
  })

  it('preserves private notes for live and deleted items', () =>
  {
    const liveId = asItemId('item-live')
    const deletedId = asItemId('item-deleted')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        items: {
          [liveId]: makeItem({
            id: liveId,
            label: 'Live',
            notes: 'Private live note',
          }),
        },
        deletedItems: [
          makeItem({
            id: deletedId,
            label: 'Deleted',
            notes: 'Private deleted note',
          }),
        ],
      }),
      'classic'
    )

    expect(result.items[liveId].notes).toBe('Private live note')
    expect(result.deletedItems[0].notes).toBe('Private deleted note')
  })

  it('falls back to auto palette color when a tier is missing its colorSpec', () =>
  {
    const rawTiers = [
      {
        id: 'tier-s',
        name: 'S',
        itemIds: [],
      },
    ]
    const result = normalizeBoardSnapshot(
      { tiers: asInvalid(rawTiers) },
      'classic'
    )
    expect(result.tiers[0].colorSpec).toEqual({
      kind: 'palette',
      index: 0,
    })
  })
})

describe('normalizeCanonicalTierColorSpec', () =>
{
  it('normalizes valid palette & custom specs (lowercases hex, falls back on invalid)', () =>
  {
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'palette', index: 3 })
    ).toEqual({ kind: 'palette', index: 3 })
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'custom', hex: '#FF0000' })
    ).toEqual({ kind: 'custom', hex: '#ff0000' })
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'custom', hex: 'not-a-color' })
    ).toEqual({ kind: 'custom', hex: '#888888' })
  })
})

describe('createNewTier', () =>
{
  it('names tiers 1-indexed by count & assigns palette color (wraps past size)', () =>
  {
    expect(createNewTier('classic', 0).name).toBe('Tier 1')
    expect(createNewTier('classic', 5).name).toBe('Tier 6')
    expect(createNewTier('classic', 12).name).toBe('Tier 13')
    expect(createNewTier('classic', 2).colorSpec).toEqual({
      kind: 'palette',
      index: 2,
    })
    // classic palette has a finite swatch count — wrap past it stays palette-kind
    expect(createNewTier('classic', 100).colorSpec.kind).toBe('palette')
  })
})
