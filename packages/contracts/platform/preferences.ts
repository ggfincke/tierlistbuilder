// packages/contracts/platform/preferences.ts
// app-wide user preferences & presentation presets

import type { PaletteId, TextStyleId, ThemeId } from '../lib/theme'
import type { LabelPlacementMode } from '../workspace/board'

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

export const EXPORT_ITEMS_PER_ROW_MIN = 3
export const EXPORT_ITEMS_PER_ROW_MAX = 20
export const EXPORT_ITEMS_PER_ROW_DEFAULT = 10

export const normalizeExportItemsPerRow = (value: unknown): number =>
{
  if (typeof value !== 'number' || !Number.isFinite(value))
  {
    return EXPORT_ITEMS_PER_ROW_DEFAULT
  }

  return Math.min(
    EXPORT_ITEMS_PER_ROW_MAX,
    Math.max(EXPORT_ITEMS_PER_ROW_MIN, Math.round(value))
  )
}

// global app preferences — persisted independently of per-board data
export interface AppPreferences
{
  itemSize: ItemSize
  showLabels: boolean
  // fallback placement applied when a board (or item) has no explicit
  // placement override — matches the LabelPlacement.mode discriminant
  defaultLabelPlacementMode: LabelPlacementMode
  // fallback caption font size in CSS px when neither item nor board pins
  // one — clamped to LABEL_FONT_SIZE_PX_MIN..MAX in board contracts
  defaultLabelFontSizePx: number
  itemShape: ItemShape
  compactMode: boolean
  exportBackgroundOverride: string | null
  exportItemsPerRow: number
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

// cloud-read wire shape for user preferences. server wall-clock updatedAt
// accompanies the payload so the client's sidecar can mark lastSyncedAt w/
// the actual cloud timestamp instead of an approximation
export interface CloudPreferencesRead
{
  preferences: AppPreferences
  updatedAt: number
}
