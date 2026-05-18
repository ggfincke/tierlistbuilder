// tests/board/tierPresets.test.ts
// built-in presets & board conversion helpers

import { describe, it, expect } from 'vitest'
import {
  createBoardDataFromPreset,
  extractPresetFromBoard,
  BUILTIN_PRESETS,
} from '~/features/workspace/tier-presets/model/tierPresets'
import {
  createPaletteTierColorSpec,
  createCustomTierColorSpec,
} from '~/shared/theme/tierColors'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'

const CLASSIC_PRESET = BUILTIN_PRESETS.find((p) => p.id === 'builtin-classic')!

const GOLD_PRESET = BUILTIN_PRESETS.find(
  (p) => p.id === 'builtin-gold-silver-bronze'
)!

describe('createBoardDataFromPreset', () =>
{
  it('builds a board from preset tier names, colorSpecs, & descriptions', () =>
  {
    const preset: TierPreset = {
      id: 'preset-test',
      name: 'Test',
      builtIn: false,
      tiers: [
        {
          name: 'Top',
          colorSpec: createPaletteTierColorSpec(0),
          description: 'The best',
        },
      ],
    }

    const classic = createBoardDataFromPreset(CLASSIC_PRESET)
    expect(classic.title).toBe('My Tier List')
    expect(classic.tiers.map((t) => t.name)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    expect(classic.tiers[0].colorSpec).toEqual(createPaletteTierColorSpec(0))
    expect(classic.tiers[3].colorSpec).toEqual(createPaletteTierColorSpec(3))
    expect(new Set(classic.tiers.map((t) => t.id)).size).toBe(
      classic.tiers.length
    )
    expect(classic.items).toEqual({})
    expect(classic.unrankedItemIds).toEqual([])
    expect(classic.deletedItems).toEqual([])

    const gold = createBoardDataFromPreset(GOLD_PRESET, 'Custom Title')
    expect(gold.title).toBe('Custom Title')
    expect(gold.tiers[0].colorSpec).toEqual(
      createCustomTierColorSpec('#ffd700')
    )

    const withDescription = createBoardDataFromPreset(preset)
    expect(withDescription.tiers[0].description).toBe('The best')
  })
})

describe('extractPresetFromBoard', () =>
{
  const sampleBoard = makeBoardSnapshot({
    title: 'My Board',
    tiers: [
      makeTier({
        id: 'tier-s',
        name: 'S',
        itemIds: [asItemId('item-1'), asItemId('item-2')],
      }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        description: 'Great picks',
        colorSpec: createCustomTierColorSpec('#abcdef'),
        itemIds: [asItemId('item-3')],
      }),
    ],
    unrankedItemIds: [asItemId('item-4')],
    items: {
      [asItemId('item-1')]: makeItem({ id: asItemId('item-1') }),
      [asItemId('item-2')]: makeItem({ id: asItemId('item-2') }),
      [asItemId('item-3')]: makeItem({ id: asItemId('item-3') }),
      [asItemId('item-4')]: makeItem({ id: asItemId('item-4') }),
    },
  })

  it('extracts tier names, colorSpecs, & descriptions; strips item ids', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'My Preset')
    expect(preset.name).toBe('My Preset')
    expect(preset.tiers).toHaveLength(2)
    expect(preset.tiers[0].name).toBe('S')
    expect(preset.tiers[0].colorSpec).toEqual(createPaletteTierColorSpec(0))
    expect(preset.tiers[1].colorSpec).toEqual(
      createCustomTierColorSpec('#abcdef')
    )
    expect(preset.tiers[1].description).toBe('Great picks')
    for (const tier of preset.tiers)
    {
      expect(tier).not.toHaveProperty('itemIds')
    }
  })

  it('round-trips: extract then create produces matching structure', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'Round Trip')
    const rebuilt = createBoardDataFromPreset(preset, 'Round Trip')
    expect(rebuilt.tiers).toHaveLength(sampleBoard.tiers.length)
    for (let i = 0; i < rebuilt.tiers.length; i++)
    {
      expect(rebuilt.tiers[i].name).toBe(sampleBoard.tiers[i].name)
      expect(rebuilt.tiers[i].colorSpec).toEqual(sampleBoard.tiers[i].colorSpec)
      expect(rebuilt.tiers[i].itemIds).toEqual([])
    }
  })

  it('round-trips rowColorSpec through extract & rebuild', () =>
  {
    const board = makeBoardSnapshot({
      tiers: [
        makeTier({
          id: 'tier-1',
          name: 'S',
          rowColorSpec: createCustomTierColorSpec('#445566'),
        }),
        makeTier({ id: 'tier-2', name: 'A' }),
      ],
    })

    const preset = extractPresetFromBoard(board, 'Row Colors')
    expect(preset.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#445566',
    })
    expect(preset.tiers[1].rowColorSpec).toBeUndefined()

    const rebuilt = createBoardDataFromPreset(preset)
    expect(rebuilt.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#445566',
    })
    expect(rebuilt.tiers[1].rowColorSpec).toBeUndefined()
  })
})
