// tests/board/tierColors.test.ts
// tier color spec resolution, theme stability, & equality

import { describe, it, expect } from 'vitest'
import {
  areTierColorSpecsEqual,
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
  getTierColorFromPaletteSpec,
  resolveTierColorSpec,
} from '~/shared/theme/tierColors'

describe('createCustomTierColorSpec', () =>
{
  it('normalizes valid hex & falls back to grey for invalid input', () =>
  {
    expect(createCustomTierColorSpec('#FF0000')).toEqual({
      kind: 'custom',
      hex: '#ff0000',
    })
    expect(createCustomTierColorSpec('nope')).toEqual({
      kind: 'custom',
      hex: '#888888',
    })
  })
})

describe('resolveTierColorSpec', () =>
{
  it('resolves palette via PALETTES & passes custom hex through unchanged across themes', () =>
  {
    const palette = createPaletteTierColorSpec(1)
    expect(resolveTierColorSpec('classic', palette)).toBe('#FFBF81')
    expect(resolveTierColorSpec('midnight', palette)).toBe('#e879f9')

    const custom = createCustomTierColorSpec('#abcdef')
    expect(resolveTierColorSpec('classic', custom)).toBe('#abcdef')
    expect(resolveTierColorSpec('midnight', custom)).toBe('#abcdef')
  })
})

describe('getTierColorFromPaletteSpec', () =>
{
  it('returns null for out-of-bounds index', () =>
  {
    expect(
      getTierColorFromPaletteSpec('classic', createPaletteTierColorSpec(999))
    ).toBeNull()
  })
})

describe('areTierColorSpecsEqual', () =>
{
  it('compares palette & custom specs by value w/ case-insensitive hex', () =>
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
