// src/theme/index.ts
// barrel export for theme definitions

export { THEME_META, THEMES } from './tokens'
export type { ThemeDefinition, ThemeMeta } from './tokens'

export { PALETTES, THEME_PALETTE } from './palettes'
export type { PaletteDefinition } from './palettes'

export {
  buildRecolorMap,
  getAutoTierColorSource,
  getAutoTierColorUpdate,
  getTierColorFromSource,
  mapTierColorToPalette,
} from './tierColors'

export { TEXT_STYLES } from './textStyles'
export type { TextStyleDefinition } from './textStyles'
