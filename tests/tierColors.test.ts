import { describe, it, expect } from 'vitest'
import {
  createPaletteTierColorSpec,
  createCustomTierColorSpec,
  getPaletteColors,
  resolveTierColorSpec,
  getAutoTierColorSpec,
  getTierColorFromPaletteSpec,
} from '../src/domain/tierColors'

describe('createPaletteTierColorSpec', () =>
{
  it('produces a palette spec w/ correct shape', () =>
  {
    expect(createPaletteTierColorSpec(0)).toEqual({
      kind: 'palette',
      index: 0,
    })
  })
})

describe('createCustomTierColorSpec', () =>
{
  it('normalizes valid hex', () =>
  {
    expect(createCustomTierColorSpec('#FF0000')).toEqual({
      kind: 'custom',
      hex: '#ff0000',
    })
  })

  it('falls back to #888888 for invalid hex', () =>
  {
    expect(createCustomTierColorSpec('nope')).toEqual({
      kind: 'custom',
      hex: '#888888',
    })
  })
})

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

describe('getAutoTierColorSpec', () =>
{
  it('returns default palette spec for indices within default range', () =>
  {
    const spec = getAutoTierColorSpec('classic', 2)
    expect(spec).toEqual({
      kind: 'palette',
      index: 2,
    })
  })

  it('wraps within the default tier ladder for indices beyond default range', () =>
  {
    const spec = getAutoTierColorSpec('classic', 13)
    expect(spec).toEqual({
      kind: 'palette',
      index: 13,
    })
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
