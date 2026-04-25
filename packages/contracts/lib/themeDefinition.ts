// packages/contracts/lib/themeDefinition.ts
// canonical shapes for theme token maps, palettes, & text styles

// CSS custom property map applied to :root when a theme activates
export interface ThemeDefinition
{
  'bg-page': string
  'bg-surface': string
  'bg-sunken': string
  'bg-overlay': string
  'bg-drag-over': string
  'bg-hover': string
  'bg-active': string
  border: string
  'border-secondary': string
  'border-hover': string
  text: string
  'text-secondary': string
  'text-muted': string
  'text-faint': string
  'text-dim': string
  accent: string
  'accent-hover': string
  destructive: string
  'destructive-hover': string
  success: string
  overlay: string
  'export-bg': string
}

// ordered tier color swatches for a palette
export interface PaletteDefinition
{
  colors: string[]
}

// typography preset — font stack + weights + optional Google Fonts URL
export interface TextStyleDefinition
{
  fontFamily: string
  weightNormal: string
  weightHeading: string
  letterSpacing: string
  googleFontsUrl: string | null
}
