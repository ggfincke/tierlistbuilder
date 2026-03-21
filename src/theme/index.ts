// src/theme/index.ts
// barrel export for theme definitions

export { THEMES } from './tokens'
export type { ThemeDefinition } from './tokens'

export { PALETTES, THEME_PALETTE } from './palettes'
export type { PaletteDefinition } from './palettes'

export {
  buildRecolorMap,
  getAutoTierColorSource,
  getAutoTierColorUpdate,
  getTierColorFromSource,
  hydrateTierColorSources,
  mapTierColorToPalette,
  resolveTierColorSource,
} from './tierColors'

export { TEXT_STYLES } from './textStyles'
export type { TextStyleDefinition } from './textStyles'
