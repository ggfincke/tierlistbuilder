// src/utils/__tests__/color.test.ts
// unit tests for hex/RGB parsing, normalization, & contrast utilities

import { describe, expect, it } from 'vitest'

import {
  clampRgbChannel,
  formatRgbInputs,
  getTextColor,
  hexToRgbColor,
  normalizeHexColor,
  parseRgbInputState,
  rgbToHexColor,
} from '../color'

describe('normalizeHexColor', () =>
{
  it('expands 3-char hex to 6-char', () =>
  {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc')
    expect(normalizeHexColor('abc')).toBe('#aabbcc')
  })

  it('passes through valid 6-char hex', () =>
  {
    expect(normalizeHexColor('#aabbcc')).toBe('#aabbcc')
    expect(normalizeHexColor('AABBCC')).toBe('#aabbcc')
  })

  it('lowercases the result', () =>
  {
    expect(normalizeHexColor('#FF00AA')).toBe('#ff00aa')
  })

  it('trims whitespace & strips leading #', () =>
  {
    expect(normalizeHexColor('  #abc  ')).toBe('#aabbcc')
  })

  it('returns null for invalid input', () =>
  {
    expect(normalizeHexColor('')).toBeNull()
    expect(normalizeHexColor('gggggg')).toBeNull()
    expect(normalizeHexColor('#abcde')).toBeNull()
    expect(normalizeHexColor('#ab')).toBeNull()
    expect(normalizeHexColor('#abcdefg')).toBeNull()
  })
})

describe('clampRgbChannel', () =>
{
  it('clamps to [0, 255]', () =>
  {
    expect(clampRgbChannel(-10)).toBe(0)
    expect(clampRgbChannel(0)).toBe(0)
    expect(clampRgbChannel(128)).toBe(128)
    expect(clampRgbChannel(255)).toBe(255)
    expect(clampRgbChannel(300)).toBe(255)
  })

  it('rounds floats', () =>
  {
    expect(clampRgbChannel(127.4)).toBe(127)
    expect(clampRgbChannel(127.6)).toBe(128)
  })
})

describe('formatRgbInputs', () =>
{
  it('converts numeric channels to strings', () =>
  {
    expect(formatRgbInputs({ red: 0, green: 128, blue: 255 })).toEqual({
      red: '0',
      green: '128',
      blue: '255',
    })
  })

  it('clamps out-of-range channels', () =>
  {
    expect(formatRgbInputs({ red: -5, green: 300, blue: 127.7 })).toEqual({
      red: '0',
      green: '255',
      blue: '128',
    })
  })
})

describe('hexToRgbColor', () =>
{
  it('parses valid 6-char hex', () =>
  {
    expect(hexToRgbColor('#ff0000')).toEqual({
      red: 255,
      green: 0,
      blue: 0,
    })
  })

  it('parses valid 3-char hex', () =>
  {
    expect(hexToRgbColor('#fff')).toEqual({
      red: 255,
      green: 255,
      blue: 255,
    })
  })

  it('returns null for invalid hex', () =>
  {
    expect(hexToRgbColor('notahex')).toBeNull()
  })
})

describe('rgbToHexColor', () =>
{
  it('converts RGB to lowercase hex', () =>
  {
    expect(rgbToHexColor({ red: 255, green: 0, blue: 0 })).toBe('#ff0000')
    expect(rgbToHexColor({ red: 0, green: 0, blue: 0 })).toBe('#000000')
    expect(rgbToHexColor({ red: 255, green: 255, blue: 255 })).toBe('#ffffff')
  })

  it('clamps out-of-range channels', () =>
  {
    expect(rgbToHexColor({ red: 300, green: -5, blue: 128 })).toBe('#ff0080')
  })
})

describe('parseRgbInputState', () =>
{
  it('parses valid channel strings', () =>
  {
    expect(parseRgbInputState({ red: '0', green: '128', blue: '255' })).toEqual(
      { red: 0, green: 128, blue: 255 }
    )
  })

  it('returns null for non-numeric channels', () =>
  {
    expect(parseRgbInputState({ red: 'abc', green: '0', blue: '0' })).toBeNull()
  })

  it('returns null for channels > 255', () =>
  {
    expect(parseRgbInputState({ red: '256', green: '0', blue: '0' })).toBeNull()
  })

  it('returns null for empty strings', () =>
  {
    expect(parseRgbInputState({ red: '', green: '0', blue: '0' })).toBeNull()
  })

  it('trims whitespace', () =>
  {
    expect(
      parseRgbInputState({ red: ' 10 ', green: ' 20 ', blue: ' 30 ' })
    ).toEqual({ red: 10, green: 20, blue: 30 })
  })
})

describe('getTextColor', () =>
{
  it('returns dark text for bright backgrounds', () =>
  {
    expect(getTextColor('#ffffff')).toBe('#1f2937')
    expect(getTextColor('#ffff00')).toBe('#1f2937')
  })

  it('returns light text for dark backgrounds', () =>
  {
    expect(getTextColor('#000000')).toBe('#f8fafc')
    expect(getTextColor('#1a1a2e')).toBe('#f8fafc')
  })

  it('returns dark text fallback for invalid hex', () =>
  {
    expect(getTextColor('invalid')).toBe('#111827')
  })
})
