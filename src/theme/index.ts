// src/theme/index.ts
// barrel export for theme definitions

export { THEME_META, THEMES } from './tokens'
export type { ThemeDefinition, ThemeMeta } from './tokens'

export { PALETTE_META, PALETTES } from './palettes'
export type { PaletteDefinition, PaletteMeta } from './palettes'

export {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
  getAutoTierColorSpec,
  getPaletteColors,
  getTierColorFromPaletteSpec,
  resolveTierColor,
  resolveTierColorSpec,
} from './tierColors'

export { TEXT_STYLES } from './textStyles'
export type { TextStyleDefinition } from './textStyles'
