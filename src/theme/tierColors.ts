// src/theme/tierColors.ts
// tier color helpers — re-export canonical domain helpers at the theme boundary

export {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
  getAutoTierColorSpec,
  getPaletteColors,
  getTierColorFromPaletteSpec,
  resolveTierColor,
  resolveTierColorSpec,
} from '../domain/tierColors'
