// src/features/workspace/settings/model/settingsStorageMigration.ts
// normalize persisted settings payloads across storage versions

import type {
  AppSettings,
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
  ToolbarPosition,
} from '@tierlistbuilder/contracts/workspace/settings'
import type {
  PaletteId,
  TextStyleId,
  ThemeId,
} from '@tierlistbuilder/contracts/lib/theme'
import { isRecord } from '~/shared/lib/typeGuards'
import { PALETTES } from '~/shared/theme/palettes'
import { TEXT_STYLES } from '~/shared/theme/textStyles'
import { THEMES } from '~/shared/theme/tokens'

const ITEM_SIZES = new Set<ItemSize>(['small', 'medium', 'large'])
const ITEM_SHAPES = new Set<ItemShape>(['square', 'rounded', 'circle'])
const LABEL_WIDTHS = new Set<LabelWidth>(['narrow', 'default', 'wide'])
const TIER_LABEL_FONT_SIZES = new Set<TierLabelFontSize>([
  'xs',
  'small',
  'medium',
  'large',
  'xl',
])
const TOOLBAR_POSITIONS = new Set<ToolbarPosition>([
  'top',
  'bottom',
  'left',
  'right',
])
const THEME_IDS = new Set<ThemeId>(Object.keys(THEMES) as ThemeId[])
const PALETTE_IDS = new Set<PaletteId>(Object.keys(PALETTES) as PaletteId[])
const TEXT_STYLE_IDS = new Set<TextStyleId>(
  Object.keys(TEXT_STYLES) as TextStyleId[]
)

const pickBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const pickNullableString = (
  value: unknown,
  fallback: string | null
): string | null =>
{
  if (typeof value === 'string')
  {
    return value
  }

  return value === null ? null : fallback
}

const pickEnum = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: T
): T =>
  typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback

const pickNullableEnum = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: T | null
): T | null =>
{
  if (value === null)
  {
    return null
  }

  return typeof value === 'string' && allowed.has(value as T)
    ? (value as T)
    : fallback
}

export const migrateSettingsState = (
  persistedState: unknown,
  defaults: AppSettings
): AppSettings =>
{
  if (!isRecord(persistedState))
  {
    return defaults
  }

  return {
    itemSize: pickEnum(persistedState.itemSize, ITEM_SIZES, defaults.itemSize),
    showLabels: pickBoolean(persistedState.showLabels, defaults.showLabels),
    itemShape: pickEnum(
      persistedState.itemShape,
      ITEM_SHAPES,
      defaults.itemShape
    ),
    compactMode: pickBoolean(persistedState.compactMode, defaults.compactMode),
    exportBackgroundOverride: pickNullableString(
      persistedState.exportBackgroundOverride,
      defaults.exportBackgroundOverride
    ),
    boardBackgroundOverride: pickNullableString(
      persistedState.boardBackgroundOverride,
      defaults.boardBackgroundOverride
    ),
    labelWidth: pickEnum(
      persistedState.labelWidth,
      LABEL_WIDTHS,
      defaults.labelWidth
    ),
    hideRowControls: pickBoolean(
      persistedState.hideRowControls,
      defaults.hideRowControls
    ),
    confirmBeforeDelete: pickBoolean(
      persistedState.confirmBeforeDelete,
      defaults.confirmBeforeDelete
    ),
    themeId: pickEnum(persistedState.themeId, THEME_IDS, defaults.themeId),
    paletteId: pickEnum(
      persistedState.paletteId,
      PALETTE_IDS,
      defaults.paletteId
    ),
    textStyleId: pickEnum(
      persistedState.textStyleId,
      TEXT_STYLE_IDS,
      defaults.textStyleId
    ),
    tierLabelBold: pickBoolean(
      persistedState.tierLabelBold,
      defaults.tierLabelBold
    ),
    tierLabelItalic: pickBoolean(
      persistedState.tierLabelItalic,
      defaults.tierLabelItalic
    ),
    tierLabelFontSize: pickEnum(
      persistedState.tierLabelFontSize,
      TIER_LABEL_FONT_SIZES,
      defaults.tierLabelFontSize
    ),
    boardLocked: pickBoolean(persistedState.boardLocked, defaults.boardLocked),
    reducedMotion: pickBoolean(
      persistedState.reducedMotion,
      defaults.reducedMotion
    ),
    preHighContrastThemeId: pickNullableEnum(
      persistedState.preHighContrastThemeId,
      THEME_IDS,
      defaults.preHighContrastThemeId
    ),
    preHighContrastPaletteId: pickNullableEnum(
      persistedState.preHighContrastPaletteId,
      PALETTE_IDS,
      defaults.preHighContrastPaletteId
    ),
    toolbarPosition: pickEnum(
      persistedState.toolbarPosition,
      TOOLBAR_POSITIONS,
      defaults.toolbarPosition
    ),
    showAltTextButton: pickBoolean(
      persistedState.showAltTextButton,
      defaults.showAltTextButton
    ),
  }
}
