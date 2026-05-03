// tests/board/tierColors.test.ts
// tier color spec helpers

import { describe, it, expect } from 'vitest'
import {
  areTierColorSpecsEqual,
  createPaletteTierColorSpec,
  createCustomTierColorSpec,
  getPaletteColors,
  resolveTierColorSpec,
  getTierColorFromPaletteSpec,
} from '~/shared/theme/tierColors'

describe('resolveTierColorSpec', () =>
{
  it('resolves palette spec to hex from PALETTES', () =>
  {
    const spec = createPaletteTierColorSpec(0)
    expect(resolveTierColorSpec('classic', spec)).toBe('#FF7F7E')
  })

  it('returns hex directly for custom spec', () =>
  {
    const spec = createCustomTierColorSpec('#abcdef')
    expect(resolveTierColorSpec('classic', spec)).toBe('#abcdef')
  })

  it('keeps palette specs stable across theme swaps while the resolved hex changes', () =>
  {
    const spec = createPaletteTierColorSpec(1)

    expect(resolveTierColorSpec('classic', spec)).toBe('#FFBF81')
    expect(resolveTierColorSpec('midnight', spec)).toBe('#e879f9')
    expect(spec).toEqual({
      kind: 'palette',
      index: 1,
    })
  })

  it('keeps custom hex values stagnant across theme swaps', () =>
  {
    const spec = createCustomTierColorSpec('#abcdef')

    expect(resolveTierColorSpec('classic', spec)).toBe('#abcdef')
    expect(resolveTierColorSpec('midnight', spec)).toBe('#abcdef')
  })
})

describe('getTierColorFromPaletteSpec', () =>
{
  it('resolves direct palette indices against the active palette', () =>
  {
    const spec = createPaletteTierColorSpec(9)
    expect(getTierColorFromPaletteSpec('midnight', spec)).toBe('#5eead4')
  })

  it('returns null for out-of-bounds index', () =>
  {
    const spec = createPaletteTierColorSpec(999)
    expect(getTierColorFromPaletteSpec('classic', spec)).toBeNull()
  })
})

describe('getPaletteColors', () =>
{
  it('returns palette swatches in picker order', () =>
  {
    expect(getPaletteColors('midnight').slice(0, 4)).toEqual([
      '#f0abfc',
      '#e879f9',
      '#c084fc',
      '#a78bfa',
    ])
  })
})

describe('areTierColorSpecsEqual', () =>
{
  it('compares palette & custom specs by value', () =>
  {
    expect(
      areTierColorSpecsEqual(
        createPaletteTierColorSpec(2),
        createPaletteTierColorSpec(2)
      )
    ).toBe(true)
    expect(
      areTierColorSpecsEqual(
        createCustomTierColorSpec('#ABCDEF'),
        createCustomTierColorSpec('#abcdef')
      )
    ).toBe(true)
    expect(
      areTierColorSpecsEqual(
        createPaletteTierColorSpec(2),
        createPaletteTierColorSpec(3)
      )
    ).toBe(false)
  })
})
