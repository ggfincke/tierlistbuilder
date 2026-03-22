// src/utils/color.ts
// shared color utilities for picker parsing, normalization, & contrast

import { hexToRgba, rgbToHex } from '@uiw/color-convert'

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
  Math.min(255, Math.max(0, Math.round(value)))

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

// compute accessible foreground color (dark or light) based on background luminance
export const getTextColor = (hexColor: string): string =>
{
  const rgb = hexToRgbColor(hexColor)
  if (!rgb)
  {
    return '#111827'
  }

  const luminance =
    (0.299 * rgb.red + 0.587 * rgb.green + 0.114 * rgb.blue) / 255

  // use dark text on bright backgrounds, light text on dark ones
  return luminance > 0.6 ? '#1f2937' : '#f8fafc'
}
