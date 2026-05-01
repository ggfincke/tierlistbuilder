// tests/board/tierPresets.test.ts
// preset-to-board & board-to-preset round-trip integrity

import { describe, it, expect } from 'vitest'
import {
  BUILTIN_PRESETS,
  createBoardDataFromPreset,
  extractPresetFromBoard,
} from '~/features/workspace/tier-presets/model/tierPresets'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
} from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'

const CLASSIC_PRESET = BUILTIN_PRESETS.find((p) => p.id === 'builtin-classic')!
const GOLD_PRESET = BUILTIN_PRESETS.find(
  (p) => p.id === 'builtin-gold-silver-bronze'
)!

describe('createBoardDataFromPreset', () =>
{
  it('preserves preset names, palette specs, & custom specs', () =>
  {
    const classic = createBoardDataFromPreset(CLASSIC_PRESET, 'Custom')
    expect(classic.title).toBe('Custom')
    expect(classic.tiers.map((t) => t.name)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    expect(classic.tiers[0].colorSpec).toEqual(createPaletteTierColorSpec(0))
    expect(new Set(classic.tiers.map((t) => t.id)).size).toBe(
      classic.tiers.length
    )

    const gold = createBoardDataFromPreset(GOLD_PRESET)
    expect(gold.tiers[0].colorSpec).toEqual(
      createCustomTierColorSpec('#ffd700')
    )
  })
})

describe('extractPresetFromBoard', () =>
{
  it('round-trips tier names, colorSpecs, descriptions, & rowColorSpec', () =>
  {
    const board = makeBoardSnapshot({
      tiers: [
        makeTier({
          id: 'tier-s',
          name: 'S',
          itemIds: [asItemId('item-1')],
          rowColorSpec: createCustomTierColorSpec('#445566'),
        }),
        makeTier({
          id: 'tier-a',
          name: 'A',
          description: 'Great picks',
          colorSpec: createCustomTierColorSpec('#abcdef'),
          itemIds: [asItemId('item-2')],
        }),
      ],
      items: {
        [asItemId('item-1')]: makeItem({ id: asItemId('item-1') }),
        [asItemId('item-2')]: makeItem({ id: asItemId('item-2') }),
      },
    })

    const preset = extractPresetFromBoard(board, 'Round Trip')
    expect(preset.id).toMatch(/^preset-/)
    expect(preset.name).toBe('Round Trip')
    expect(preset.builtIn).toBe(false)
    expect(preset.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#445566',
    })
    expect(preset.tiers[1].description).toBe('Great picks')
    expect(preset.tiers).not.toHaveProperty([0, 'itemIds'])

    const rebuilt = createBoardDataFromPreset(preset)
    expect(rebuilt.tiers).toHaveLength(2)
    expect(rebuilt.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#445566',
    })
    expect(rebuilt.tiers[1].colorSpec).toEqual(
      createCustomTierColorSpec('#abcdef')
    )
    expect(rebuilt.tiers.every((t) => t.itemIds.length === 0)).toBe(true)
  })
})
