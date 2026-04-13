import { describe, it, expect } from 'vitest'
import {
  createBoardDataFromPreset,
  extractPresetFromBoard,
  BUILTIN_PRESETS,
} from '@/features/workspace/tier-presets/model/tierPresets'
import {
  createPaletteTierColorSpec,
  createCustomTierColorSpec,
} from '@/shared/theme/tierColors'
import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import type { TierPreset } from '@/features/workspace/tier-presets/model/contract'

const CLASSIC_PRESET = BUILTIN_PRESETS.find((p) => p.id === 'builtin-classic')!

const GOLD_PRESET = BUILTIN_PRESETS.find(
  (p) => p.id === 'builtin-gold-silver-bronze'
)!

describe('createBoardDataFromPreset', () =>
{
  it('creates a board w/ the default title', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET)
    expect(data.title).toBe('My Tier List')
  })

  it('accepts a custom title override', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET, 'Custom Title')
    expect(data.title).toBe('Custom Title')
  })

  it('generates unique tier IDs for each tier', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET)
    const ids = data.tiers.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids)
    {
      expect(id).toMatch(/^tier-/)
    }
  })

  it('preserves tier names from the preset', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET)
    expect(data.tiers.map((t) => t.name)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
  })

  it('preserves palette colorSpecs from the preset', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET)
    expect(data.tiers[0].colorSpec).toEqual(createPaletteTierColorSpec(0))
    expect(data.tiers[3].colorSpec).toEqual(createPaletteTierColorSpec(3))
  })

  it('preserves custom colorSpecs from the preset', () =>
  {
    const data = createBoardDataFromPreset(GOLD_PRESET)
    expect(data.tiers[0].colorSpec).toEqual(
      createCustomTierColorSpec('#ffd700')
    )
  })

  it('starts all tiers w/ empty itemIds', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET)
    for (const tier of data.tiers)
    {
      expect(tier.itemIds).toEqual([])
    }
  })

  it('starts w/ empty items, unranked, & deletedItems', () =>
  {
    const data = createBoardDataFromPreset(CLASSIC_PRESET)
    expect(data.items).toEqual({})
    expect(data.unrankedItemIds).toEqual([])
    expect(data.deletedItems).toEqual([])
  })

  it('preserves tier descriptions when present', () =>
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
    const data = createBoardDataFromPreset(preset)
    expect(data.tiers[0].description).toBe('The best')
  })
})

describe('extractPresetFromBoard', () =>
{
  const sampleBoard: BoardSnapshot = {
    title: 'My Board',
    tiers: [
      {
        id: 'tier-s',
        name: 'S',
        colorSpec: createPaletteTierColorSpec(0),
        itemIds: ['item-1', 'item-2'],
      },
      {
        id: 'tier-a',
        name: 'A',
        description: 'Great picks',
        colorSpec: createCustomTierColorSpec('#abcdef'),
        itemIds: ['item-3'],
      },
    ],
    unrankedItemIds: ['item-4'],
    items: {
      'item-1': { id: 'item-1' },
      'item-2': { id: 'item-2' },
      'item-3': { id: 'item-3' },
      'item-4': { id: 'item-4' },
    },
    deletedItems: [],
  }

  it('generates a preset ID w/ the preset- prefix', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'My Preset')
    expect(preset.id).toMatch(/^preset-/)
  })

  it('uses the provided name', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'Custom Name')
    expect(preset.name).toBe('Custom Name')
  })

  it('marks the preset as not built-in', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'Test')
    expect(preset.builtIn).toBe(false)
  })

  it('preserves tier names & colorSpecs', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'Test')
    expect(preset.tiers).toHaveLength(2)
    expect(preset.tiers[0].name).toBe('S')
    expect(preset.tiers[0].colorSpec).toEqual(createPaletteTierColorSpec(0))
    expect(preset.tiers[1].colorSpec).toEqual(
      createCustomTierColorSpec('#abcdef')
    )
  })

  it('preserves tier descriptions', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'Test')
    expect(preset.tiers[1].description).toBe('Great picks')
  })

  it('strips itemIds from tiers (presets have no items)', () =>
  {
    const preset = extractPresetFromBoard(sampleBoard, 'Test')
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
})
