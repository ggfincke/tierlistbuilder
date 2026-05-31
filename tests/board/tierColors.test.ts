// tests/board/tierColors.test.ts
// tier color spec helpers

import { describe, it, expect } from 'vitest'
import {
  areTierColorSpecsEqual,
  createPaletteTierColorSpec,
  createCustomTierColorSpec,
  resolveTierColorSpec,
} from '~/shared/theme/tierColors'

describe('resolveTierColorSpec', () =>
{
  it('returns the active palette hex for palette specs and the literal hex for custom specs, with palette specs staying theme-agnostic', () =>
  {
    const palette = createPaletteTierColorSpec(1)
    const custom = createCustomTierColorSpec('#abcdef')

    expect(resolveTierColorSpec('classic', palette)).toBe('#FFBF81')
    expect(resolveTierColorSpec('midnight', palette)).toBe('#e879f9')
    expect(palette).toEqual({ kind: 'palette', index: 1 })

    expect(resolveTierColorSpec('classic', custom)).toBe('#abcdef')
    expect(resolveTierColorSpec('midnight', custom)).toBe('#abcdef')
  })
})

describe('areTierColorSpecsEqual', () =>
{
  it('matches palette specs by index and custom specs case-insensitively', () =>
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
