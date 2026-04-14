// src/shared/types/theme.ts
// theme, palette, text-style identifiers, & tier color spec primitives

// color theme identifiers
export type ThemeId =
  | 'classic'
  | 'classic-light'
  | 'midnight'
  | 'forest'
  | 'ember'
  | 'sakura'
  | 'amoled'
  | 'high-contrast'

// text style identifiers
export type TextStyleId = 'default' | 'mono' | 'serif' | 'rounded' | 'display'

// tier label palette identifiers
export type PaletteId =
  | 'classic'
  | 'ocean'
  | 'midnight'
  | 'forest'
  | 'ember'
  | 'sakura'
  | 'twilight'
  | 'high-contrast'

// stable palette slot used to derive a tier color from the active theme
export interface TierPaletteColorSpec
{
  kind: 'palette'
  // zero-based index within the active palette's ordered swatch list
  index: number
}

// literal custom color chosen by the user
export interface TierCustomColorSpec
{
  kind: 'custom'
  // resolved hex color that should remain stable across theme changes
  hex: string
}

// canonical color source for a tier label — shared across boards, presets, & theme helpers
export type TierColorSpec = TierPaletteColorSpec | TierCustomColorSpec
