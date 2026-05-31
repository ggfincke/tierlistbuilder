// tests/shared-lib/color.test.ts
// hex/rgb parsing, contrast picking, & input validation

import { describe, it, expect } from 'vitest'
import {
  normalizeHexColor,
  hexToRgbColor,
  rgbToHexColor,
  getTextColor,
  parseRgbInputState,
} from '~/shared/lib/color'

describe('color helpers', () =>
{
  it('normalizes hex (3-char shorthand, case, hash) & returns null for invalid input', () =>
  {
    expect(normalizeHexColor('#FFF')).toBe('#ffffff')
    expect(normalizeHexColor('abc')).toBe('#aabbcc')
    expect(normalizeHexColor('AABBCC')).toBe('#aabbcc')
    expect(normalizeHexColor('xyz')).toBeNull()
    expect(normalizeHexColor('#12345')).toBeNull()
  })

  it('round-trips hex <-> rgb without loss', () =>
  {
    const rgb = hexToRgbColor('#ff8040')
    expect(rgb).toEqual({ red: 255, green: 128, blue: 64 })
    expect(rgbToHexColor(rgb!)).toBe('#ff8040')
  })

  it('picks higher-contrast text color for dark, light, & saturated backgrounds', () =>
  {
    expect(getTextColor('#ffffff')).toBe('#000000')
    expect(getTextColor('#000000')).toBe('#ffffff')
    expect(getTextColor('#00ff00')).toBe('#000000')
  })

  it('parses string rgb input within range & rejects out-of-range', () =>
  {
    expect(parseRgbInputState({ red: '255', green: '128', blue: '0' })).toEqual(
      {
        red: 255,
        green: 128,
        blue: 0,
      }
    )
    expect(parseRgbInputState({ red: '300', green: '0', blue: '0' })).toBeNull()
  })
})
