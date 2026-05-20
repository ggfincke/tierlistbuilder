// tests/board/boardSnapshot.test.ts
// board snapshot creation & normalization helpers

import { describe, it, expect } from 'vitest'
import {
  createInitialBoardData,
  createNewTier,
  resetBoardData,
  normalizeBoardSnapshot,
} from '~/shared/board-data/boardSnapshot'
import {
  createCustomTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  boardAutoPlateSettingsEqual,
  type BoardAutoPlateSettings,
  type BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'
import { asInvalid } from '@tests/typeHelpers'

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
            imageRef: { hash: 'thumb-hash' },
            tileImageRef: { hash: 'tile-hash' },
            sourceImageRef: { hash: 'source-hash' },
            transform: { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 },
          }),
        },
      }),
      'classic'
    )

    expect(result.items[id].tileImageRef).toEqual({ hash: 'tile-hash' })
    expect(result.items[id].sourceImageRef).toEqual({ hash: 'source-hash' })
    expect(result.items[id].transform).toBeUndefined()
  })

  it('normalizes item media plates through the shared enum helper', () =>
  {
    const id = asItemId('media-plate-item')
    const invalidId = asItemId('invalid-media-plate-item')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        items: {
          [id]: makeItem({ id, mediaPlate: 'light' }),
          [invalidId]: {
            ...makeItem({ id: invalidId }),
            mediaPlate: asInvalid('blue'),
          },
        },
      }),
      'classic'
    )

    expect(result.items[id].mediaPlate).toBe('light')
    expect(result.items[invalidId].mediaPlate).toBeUndefined()
  })

  it('canonicalizes board auto-plate settings by mode', () =>
  {
    const auto = normalizeBoardSnapshot(
      makeBoardSnapshot({
        autoPlate: asInvalid({ mode: 'auto', uniformColor: '#ffffff' }),
      }),
      'classic'
    )
    const uniform = normalizeBoardSnapshot(
      makeBoardSnapshot({
        autoPlate: { mode: 'uniform', uniformColor: '#ABCDEF' },
      }),
      'classic'
    )
    const invalidUniform = normalizeBoardSnapshot(
      makeBoardSnapshot({
        autoPlate: asInvalid({ mode: 'uniform', uniformColor: 'not-a-color' }),
      }),
      'classic'
    )

    expect(auto.autoPlate).toEqual({ mode: 'auto' })
    expect(uniform.autoPlate).toEqual({
      mode: 'uniform',
      uniformColor: '#ABCDEF',
    })
    expect(invalidUniform.autoPlate).toEqual({ mode: 'uniform' })
  })

  it('compares non-uniform auto-plate settings by mode only', () =>
  {
    expect(
      boardAutoPlateSettingsEqual(
        asInvalid<BoardAutoPlateSettings>({
          mode: 'auto',
          uniformColor: '#ffffff',
        }),
        { mode: 'auto' }
      )
    ).toBe(true)
    expect(
      boardAutoPlateSettingsEqual(
        asInvalid<BoardAutoPlateSettings>({
          mode: 'off',
          uniformColor: '#ffffff',
        }),
        { mode: 'off' }
      )
    ).toBe(true)
    expect(
      boardAutoPlateSettingsEqual(
        { mode: 'uniform', uniformColor: '#ffffff' },
        { mode: 'uniform' }
      )
    ).toBe(false)
  })

  it('preserves source metadata, private notes, and cloud media refs', () =>
  {
    const id = asItemId('source-item')
    const deletedId = asItemId('deleted-source-item')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        sourceTemplateId: 'template-slug',
        sourceRankingId: 'ranking-slug',
        sourceTemplateTitle: 'Template title',
        sourceRankingTitle: 'Ranking title',
        preferredCriterionExternalId: 'criterion-external-id',
        sourceTemplateCoverMedia: {
          externalId: 'media-cover',
          contentHash: 'cover-hash',
          url: 'https://example.test/cover.webp',
          width: 1200,
          height: 800,
          mimeType: 'image/webp',
        },
        sourceTemplateCoverFraming: {
          browseHero: { x: 0, y: 0, width: 1, height: 1 },
          detailHero: null,
          card: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
        },
        items: {
          [id]: makeItem({
            id,
            notes: 'Private rationale',
            sourceTemplateItemExternalId: 'template-item-1',
            imageRef: {
              hash: 'image-hash',
              cloudMediaExternalId: 'media-source',
              cloudMediaOwnership: 'source',
            },
          }),
        },
        deletedItems: [
          makeItem({
            id: deletedId,
            notes: 'Deleted note',
            sourceTemplateItemExternalId: 'template-item-deleted',
          }),
        ],
      }),
      'classic'
    )

    expect(result.sourceTemplateId).toBe('template-slug')
    expect(result.sourceRankingId).toBe('ranking-slug')
    expect(result.sourceTemplateTitle).toBe('Template title')
    expect(result.sourceRankingTitle).toBe('Ranking title')
    expect(result.preferredCriterionExternalId).toBe('criterion-external-id')
    expect(result.sourceTemplateCoverMedia?.externalId).toBe('media-cover')
    expect(result.sourceTemplateCoverFraming?.card).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.8,
      height: 0.7,
    })
    expect(result.items[id]).toMatchObject({
      notes: 'Private rationale',
      sourceTemplateItemExternalId: 'template-item-1',
      imageRef: {
        hash: 'image-hash',
        cloudMediaExternalId: 'media-source',
        cloudMediaOwnership: 'source',
      },
    })
    expect(result.deletedItems[0]).toMatchObject({
      notes: 'Deleted note',
      sourceTemplateItemExternalId: 'template-item-deleted',
    })
  })

  it('clamps board slot ratios but preserves natural image ratios', () =>
  {
    const id = asItemId('panoramic')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        itemAspectRatio: 100,
        items: {
          [id]: makeItem({
            id,
            imageRef: { hash: 'panoramic' },
            aspectRatio: 100,
          }),
        },
      }),
      'classic'
    )

    expect(result.itemAspectRatio).toBe(4)
    expect(result.items[id].aspectRatio).toBe(100)
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

  it('preserves a valid rowColorSpec & drops invalid input', () =>
  {
    const present = normalizeBoardSnapshot(
      makeBoardSnapshot({
        tiers: [
          makeTier({
            id: 'tier-s',
            name: 'S',
            rowColorSpec: createCustomTierColorSpec('#112233'),
          }),
        ],
      }),
      'classic'
    )
    expect(present.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#112233',
    })

    const invalid: Partial<BoardSnapshot> & { tiers: unknown[] } = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          rowColorSpec: 'not a spec',
          itemIds: [],
        },
      ],
      unrankedItemIds: [],
      items: {},
      deletedItems: [],
    }
    const dropped = normalizeBoardSnapshot(
      invalid as Partial<BoardSnapshot>,
      'classic'
    )
    expect(dropped.tiers[0].rowColorSpec).toBeUndefined()
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

  it('returns null for nullish, primitive, or missing-field inputs', () =>
  {
    expect(normalizeCanonicalTierColorSpec(null)).toBeNull()
    expect(normalizeCanonicalTierColorSpec(undefined)).toBeNull()
    expect(normalizeCanonicalTierColorSpec('palette')).toBeNull()
    expect(normalizeCanonicalTierColorSpec(42)).toBeNull()
    expect(normalizeCanonicalTierColorSpec(true)).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ index: 0 })).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ kind: 'palette' })).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ kind: 'custom' })).toBeNull()
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
