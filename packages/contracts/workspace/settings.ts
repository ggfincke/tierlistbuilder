// packages/contracts/workspace/settings.ts
// app-wide user settings & presentation presets

import type { PaletteId, TextStyleId, ThemeId } from '../lib/theme'

// item display size presets
export const ITEM_SIZES = ['small', 'medium', 'large'] as const
export type ItemSize = (typeof ITEM_SIZES)[number]

// item crop shape presets
export const ITEM_SHAPES = ['square', 'rounded', 'circle'] as const
export type ItemShape = (typeof ITEM_SHAPES)[number]

// tier label column width presets
export const LABEL_WIDTHS = ['narrow', 'default', 'wide'] as const
export type LabelWidth = (typeof LABEL_WIDTHS)[number]

// tier label font size presets (independent of item size)
export const TIER_LABEL_FONT_SIZES = [
  'xs',
  'small',
  'medium',
  'large',
  'xl',
] as const
export type TierLabelFontSize = (typeof TIER_LABEL_FONT_SIZES)[number]

// toolbar placement relative to the tier list
export const TOOLBAR_POSITIONS = ['top', 'bottom', 'left', 'right'] as const
export type ToolbarPosition = (typeof TOOLBAR_POSITIONS)[number]

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
  toolbarPosition: ToolbarPosition
  showAltTextButton: boolean
  autoCropTrimSoftShadows: boolean
}
