// src/utils/color.ts
// shared color utilities for accessible contrast & luminance checks

const VALID_HEX = /^[\da-f]{6}$/i

// compute accessible foreground color (dark or light) based on background luminance
export const getTextColor = (hexColor: string): string =>
{
  const normalized = hexColor.replace('#', '')
  if (!VALID_HEX.test(normalized))
  {
    return '#111827'
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  // relative luminance via standard BT.601 coefficients
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  // use dark text on bright backgrounds, light text on dark ones
  return luminance > 0.6 ? '#1f2937' : '#f8fafc'
}
