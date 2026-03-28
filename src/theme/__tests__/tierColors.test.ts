// src/theme/__tests__/tierColors.test.ts
// unit tests for tier color source assignment & remapping

import { describe, expect, it } from 'vitest'

import { PALETTES } from '../palettes'
import {
  buildRecolorMap,
  getAutoTierColorSource,
  getAutoTierColorUpdate,
  getTierColorFromSource,
  mapTierColorToPalette,
} from '../tierColors'
import type { Tier, TierColorSource } from '../../types'

const makeTier = (
  overrides: Partial<Tier> & { id: string; color: string }
): Tier => ({
  name: 'S',
  colorSource: null,
  itemIds: [],
  ...overrides,
})

describe('getTierColorFromSource', () =>
{
  it('returns the correct default slot color', () =>
  {
    const source: TierColorSource = { paletteType: 'default', index: 0 }
    expect(getTierColorFromSource('classic', source)).toBe('#f47c7c')
  })

  it('returns the correct preset slot color', () =>
  {
    const source: TierColorSource = { paletteType: 'preset', index: 0 }
    expect(getTierColorFromSource('classic', source)).toBe('#f47c7c')
  })

  it('returns null for out-of-range default index', () =>
  {
    const source: TierColorSource = { paletteType: 'default', index: 99 }
    expect(getTierColorFromSource('classic', source)).toBeNull()
  })

  it('returns null for out-of-range preset index', () =>
  {
    const source: TierColorSource = { paletteType: 'preset', index: 99 }
    expect(getTierColorFromSource('classic', source)).toBeNull()
  })
})

describe('getAutoTierColorSource', () =>
{
  it('returns default slot when index is within defaults range', () =>
  {
    expect(getAutoTierColorSource('classic', 0)).toEqual({
      paletteType: 'default',
      index: 0,
    })
    expect(getAutoTierColorSource('classic', 5)).toEqual({
      paletteType: 'default',
      index: 5,
    })
  })

  it('cycles through presets for indices beyond defaults', () =>
  {
    const defaultsLength = PALETTES.classic.defaults.length
    const presetsLength = PALETTES.classic.presets.length

    expect(getAutoTierColorSource('classic', defaultsLength)).toEqual({
      paletteType: 'preset',
      index: defaultsLength % presetsLength,
    })
  })
})

describe('getAutoTierColorUpdate', () =>
{
  it('returns resolved color & source for a valid position', () =>
  {
    const update = getAutoTierColorUpdate('classic', 0)
    expect(update.color).toBe('#f47c7c')
    expect(update.colorSource).toEqual({ paletteType: 'default', index: 0 })
  })

  it('returns correct color for middle position', () =>
  {
    const update = getAutoTierColorUpdate('classic', 2)
    expect(update.color).toBe('#edd77b')
    expect(update.colorSource).toEqual({ paletteType: 'default', index: 2 })
  })
})

describe('buildRecolorMap', () =>
{
  it('returns entries for tiers whose color changes across palettes', () =>
  {
    const tiers: Tier[] = [
      makeTier({
        id: 'tier-s',
        color: '#f47c7c',
        colorSource: { paletteType: 'default', index: 0 },
      }),
    ]
    const map = buildRecolorMap('classic', 'midnight', tiers)
    expect(map.size).toBe(1)
    expect(map.get('tier-s')?.color).toBe('#c084fc')
  })

  it('skips tiers whose color does not change', () =>
  {
    const tiers: Tier[] = [
      makeTier({
        id: 'tier-s',
        color: '#f47c7c',
        colorSource: { paletteType: 'default', index: 0 },
      }),
    ]
    const map = buildRecolorMap('classic', 'classic', tiers)
    expect(map.size).toBe(0)
  })

  it('skips custom tiers (colorSource null)', () =>
  {
    const tiers: Tier[] = [
      makeTier({
        id: 'tier-x',
        color: '#123456',
        colorSource: null,
      }),
    ]
    const map = buildRecolorMap('classic', 'midnight', tiers)
    expect(map.size).toBe(0)
  })
})

describe('mapTierColorToPalette', () =>
{
  it('maps default slot across palettes', () =>
  {
    const tier = makeTier({
      id: 'tier-s',
      color: '#f47c7c',
      colorSource: { paletteType: 'default', index: 0 },
    })
    const result = mapTierColorToPalette('midnight', tier)
    expect(result?.color).toBe('#c084fc')
    expect(result?.colorSource).toEqual({
      paletteType: 'default',
      index: 0,
    })
  })

  it('maps preset slot by swatch position', () =>
  {
    const tier = makeTier({
      id: 'tier-x',
      color: '#a0f0e8',
      colorSource: { paletteType: 'preset', index: 6 },
    })
    const result = mapTierColorToPalette('midnight', tier)
    expect(result?.color).toBe('#38bdf8')
    expect(result?.colorSource).toEqual({
      paletteType: 'preset',
      index: 6,
    })
  })

  it('returns null for a custom color (null colorSource)', () =>
  {
    const tier = makeTier({
      id: 'tier-x',
      color: '#123456',
      colorSource: null,
    })
    const result = mapTierColorToPalette('midnight', tier)
    expect(result).toBeNull()
  })
})
