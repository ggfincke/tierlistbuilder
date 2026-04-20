// packages/contracts/lib/theme.ts
// theme, palette, text-style identifiers, & tier color spec primitives

// color theme identifiers
export const THEME_IDS = [
  'classic',
  'classic-light',
  'midnight',
  'forest',
  'ember',
  'sakura',
  'amoled',
  'high-contrast',
] as const
export type ThemeId = (typeof THEME_IDS)[number]

// text style identifiers
export const TEXT_STYLE_IDS = [
  'default',
  'mono',
  'serif',
  'rounded',
  'display',
] as const
export type TextStyleId = (typeof TEXT_STYLE_IDS)[number]

// tier label palette identifiers
export const PALETTE_IDS = [
  'classic',
  'ocean',
  'midnight',
  'forest',
  'ember',
  'sakura',
  'twilight',
  'high-contrast',
] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

// stable palette slot used to derive a tier color from the active theme
export interface TierPaletteColorSpec
{
  kind: 'palette'
  index: number
}

// literal custom color chosen by the user
export interface TierCustomColorSpec
{
  kind: 'custom'
  hex: string
}

// canonical color source for a tier label — shared across boards, presets, & theme helpers
export type TierColorSpec = TierPaletteColorSpec | TierCustomColorSpec
