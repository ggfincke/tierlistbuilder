// src/shared/lib/color.ts
// shared color utilities for picker parsing, normalization, & contrast

import { hexToRgba, rgbToHex } from '@uiw/color-convert'
import { clamp } from './math'

// numeric rgb channel triplet
export interface RgbColor
{
  red: number
  green: number
  blue: number
}

// string rgb channel triplet used by text inputs
export interface RgbInputState
{
  red: string
  green: string
  blue: string
}

const VALID_HEX = /^[\da-f]{3}([\da-f]{3})?$/i
const VALID_RGB_CHANNEL = /^\d{1,3}$/
const DARK_TEXT_COLOR = '#000000'
const LIGHT_TEXT_COLOR = '#ffffff'

// normalize a user-entered hex string to lowercase #rrggbb
export const normalizeHexColor = (value: string): string | null =>
{
  const trimmed = value.trim().replace(/^#/, '')
  if (!VALID_HEX.test(trimmed))
  {
    return null
  }

  const expanded =
    trimmed.length === 3
      ? trimmed
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : trimmed

  return `#${expanded.toLowerCase()}`
}

// clamp a channel to the valid rgb byte range
export const clampRgbChannel = (value: number): number =>
  clamp(Math.round(value), 0, 255)

// convert a numeric rgb triplet to input strings
export const formatRgbInputs = (color: RgbColor): RgbInputState => ({
  red: String(clampRgbChannel(color.red)),
  green: String(clampRgbChannel(color.green)),
  blue: String(clampRgbChannel(color.blue)),
})

// convert a normalized hex string to numeric rgb channels
export const hexToRgbColor = (hexColor: string): RgbColor | null =>
{
  const normalized = normalizeHexColor(hexColor)
  if (!normalized)
  {
    return null
  }

  const rgba = hexToRgba(normalized)

  return {
    red: clampRgbChannel(rgba.r),
    green: clampRgbChannel(rgba.g),
    blue: clampRgbChannel(rgba.b),
  }
}

// convert numeric rgb channels to lowercase #rrggbb
export const rgbToHexColor = (color: RgbColor): string =>
{
  return rgbToHex({
    r: clampRgbChannel(color.red),
    g: clampRgbChannel(color.green),
    b: clampRgbChannel(color.blue),
  }).toLowerCase()
}

// parse the rgb text inputs if every channel is complete & in range
export const parseRgbInputState = (value: RgbInputState): RgbColor | null =>
{
  const channels = [value.red, value.green, value.blue].map((channel) =>
    channel.trim()
  )

  if (channels.some((channel) => !VALID_RGB_CHANNEL.test(channel)))
  {
    return null
  }

  const [red, green, blue] = channels.map((channel) =>
    Number.parseInt(channel, 10)
  )

  if ([red, green, blue].some((channel) => channel > 255))
  {
    return null
  }

  return { red, green, blue }
}

const getRelativeLuminance = (color: RgbColor): number =>
{
  const channels = [color.red, color.green, color.blue].map((channel) =>
  {
    const normalized = channel / 255

    if (normalized <= 0.03928)
    {
      return normalized / 12.92
    }

    return ((normalized + 0.055) / 1.055) ** 2.4
  })

  const [red, green, blue] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export const getContrastRatio = (
  backgroundHexColor: string,
  foregroundHexColor: string
): number =>
{
  const background = hexToRgbColor(backgroundHexColor)
  const foreground = hexToRgbColor(foregroundHexColor)

  if (!background || !foreground)
  {
    return 1
  }

  const backgroundLuminance = getRelativeLuminance(background)
  const foregroundLuminance = getRelativeLuminance(foreground)
  const brighterLuminance = Math.max(backgroundLuminance, foregroundLuminance)
  const darkerLuminance = Math.min(backgroundLuminance, foregroundLuminance)

  return (brighterLuminance + 0.05) / (darkerLuminance + 0.05)
}

// compute the higher-contrast text color between pure black & pure white;
// computes the background luminance once (4x speedup vs. two getContrastRatio
// calls) since both candidates are pure black & pure white
export const getTextColor = (hexColor: string): string =>
{
  const rgb = hexToRgbColor(hexColor)
  if (!rgb)
  {
    return LIGHT_TEXT_COLOR
  }

  const luminance = getRelativeLuminance(rgb)
  // contrast ratio against pure white (luminance 1) > against pure black
  // (luminance 0) when luminance < ~0.179 — pick the higher-contrast option
  return luminance > 0.179 ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR
}

// pick a 1-2px text-shadow that pops against the contrast text color of `hex`
export const getContrastingTextShadow = (hexColor: string): string =>
  getTextColor(hexColor) === LIGHT_TEXT_COLOR
    ? '0 0 2px rgba(0,0,0,0.4)'
    : '0 0 2px rgba(255,255,255,0.35)'
