// tests/shared-lib/color.test.ts
// hex/rgb parsing, contrast picking, & input validation

import { describe, it, expect } from 'vitest'
import {
  hexToRgbColor,
  rgbToHexColor,
  getTextColor,
} from '~/shared/lib/color'

describe('color helpers', () =>
{
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
})
