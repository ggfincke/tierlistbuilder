// tests/utils/color.test.ts
// color utility helpers

import { describe, it, expect } from 'vitest'
import {
  getContrastRatio,
  normalizeHexColor,
  hexToRgbColor,
  rgbToHexColor,
  getTextColor,
  parseRgbInputState,
} from '~/shared/lib/color'

describe('normalizeHexColor', () =>
{
  it('expands 3-char shorthand to 6-char lowercase', () =>
  {
    expect(normalizeHexColor('#FFF')).toBe('#ffffff')
    expect(normalizeHexColor('abc')).toBe('#aabbcc')
  })

  it('normalizes 6-char hex to lowercase w/ hash', () =>
  {
    expect(normalizeHexColor('AABBCC')).toBe('#aabbcc')
    expect(normalizeHexColor('#ff8040')).toBe('#ff8040')
  })

  it('returns null for invalid input', () =>
  {
    expect(normalizeHexColor('xyz')).toBeNull()
    expect(normalizeHexColor('#12345')).toBeNull()
    expect(normalizeHexColor('')).toBeNull()
  })
})

describe('hexToRgbColor / rgbToHexColor round-trip', () =>
{
  it('converts hex to rgb & back without loss', () =>
  {
    const rgb = hexToRgbColor('#ff8040')
    expect(rgb).toEqual({ red: 255, green: 128, blue: 64 })
    expect(rgbToHexColor(rgb!)).toBe('#ff8040')
  })
})

describe('getTextColor', () =>
{
  it('returns dark text for bright backgrounds', () =>
  {
    expect(getTextColor('#ffffff')).toBe('#000000')
  })

  it('returns light text for dark backgrounds', () =>
  {
    expect(getTextColor('#000000')).toBe('#ffffff')
  })

  it('picks the higher-contrast option for saturated colors', () =>
  {
    expect(getTextColor('#00ff00')).toBe('#000000')
  })
})

describe('getContrastRatio', () =>
{
  it('returns the WCAG maximum for black on white', () =>
  {
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('prefers black over white on bright green', () =>
  {
    expect(getContrastRatio('#00ff00', '#000000')).toBeGreaterThan(
      getContrastRatio('#00ff00', '#ffffff')
    )
  })
})

describe('parseRgbInputState', () =>
{
  it('parses valid string inputs to numeric rgb', () =>
  {
    expect(parseRgbInputState({ red: '255', green: '128', blue: '0' })).toEqual(
      { red: 255, green: 128, blue: 0 }
    )
  })

  it('returns null for out-of-range values', () =>
  {
    expect(parseRgbInputState({ red: '300', green: '0', blue: '0' })).toBeNull()
  })
})
