import { describe, it, expect } from 'vitest'
import {
  createPaletteTierColorSpec,
  createCustomTierColorSpec,
  resolveTierColorSpec,
  getAutoTierColorSpec,
  getTierColorFromPaletteSpec,
} from '../src/domain/tierColors'

describe('createPaletteTierColorSpec', () =>
{
  it('produces a palette spec w/ correct shape', () =>
  {
    expect(createPaletteTierColorSpec('default', 0)).toEqual({
      kind: 'palette',
      paletteType: 'default',
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
    const spec = createPaletteTierColorSpec('default', 0)
    // classic palette default[0] = '#f47c7c'
    expect(resolveTierColorSpec('classic', spec)).toBe('#f47c7c')
  })

  it('returns hex directly for custom spec', () =>
  {
    const spec = createCustomTierColorSpec('#abcdef')
    expect(resolveTierColorSpec('classic', spec)).toBe('#abcdef')
  })
})

describe('getAutoTierColorSpec', () =>
{
  it('returns default palette spec for indices within default range', () =>
  {
    const spec = getAutoTierColorSpec('classic', 2)
    expect(spec).toEqual({
      kind: 'palette',
      paletteType: 'default',
      index: 2,
    })
  })

  it('wraps into presets for indices beyond default range', () =>
  {
    // classic has 6 defaults, so index 7 should wrap to preset index 7 % 15 = 7
    const spec = getAutoTierColorSpec('classic', 7)
    expect(spec).toEqual({
      kind: 'palette',
      paletteType: 'preset',
      index: 7,
    })
  })
})

describe('getTierColorFromPaletteSpec', () =>
{
  it('returns null for out-of-bounds index', () =>
  {
    const spec = createPaletteTierColorSpec('default', 999)
    expect(getTierColorFromPaletteSpec('classic', spec)).toBeNull()
  })
})
