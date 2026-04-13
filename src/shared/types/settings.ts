// src/shared/types/settings.ts
// app-wide user settings & presentation presets

import type { PaletteId, TextStyleId, ThemeId } from './theme'

// item display size presets
export type ItemSize = 'small' | 'medium' | 'large'

// item crop shape presets
export type ItemShape = 'square' | 'rounded' | 'circle'

// tier label column width presets
export type LabelWidth = 'narrow' | 'default' | 'wide'

// tier label font size presets (independent of item size)
export type TierLabelFontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl'

// toolbar placement relative to the tier list
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right'

// global app settings — persisted independently of per-board data
export interface AppSettings
{
  itemSize: ItemSize
  showLabels: boolean
  itemShape: ItemShape
  compactMode: boolean
  exportBackgroundOverride: string | null
  boardBackgroundOverride: string | null
  labelWidth: LabelWidth
  hideRowControls: boolean
  confirmBeforeDelete: boolean
  themeId: ThemeId
  paletteId: PaletteId
  textStyleId: TextStyleId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
  boardLocked: boolean
  reducedMotion: boolean
  preHighContrastThemeId: ThemeId | null
  preHighContrastPaletteId: PaletteId | null
  toolbarPosition: ToolbarPosition
  showAltTextButton: boolean
}
