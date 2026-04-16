// convex/lib/validators.ts
// reusable v.object() validators that mirror packages/contracts shapes

import type { Infer } from 'convex/values'
import { v } from 'convex/values'
import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'

// TierColorSpec — either a palette slot or a literal custom hex
// mirrors packages/contracts/lib/theme.ts
export const tierColorSpecValidator = v.union(
  v.object({
    kind: v.literal('palette'),
    index: v.number(),
  }),
  v.object({
    kind: v.literal('custom'),
    hex: v.string(),
  })
)

// single tier inside a reusable preset — mirrors TierPresetTier in packages/contracts
const tierPresetTierValidator = v.object({
  name: v.string(),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.optional(tierColorSpecValidator),
  description: v.optional(v.string()),
})

// array of tiers stored inline on a tierPresets row
export const tierPresetTiersValidator = v.array(tierPresetTierValidator)

// ThemeId — must stay in sync w/ packages/contracts/lib/theme.ts
const themeIdValidator = v.union(
  v.literal('classic'),
  v.literal('classic-light'),
  v.literal('midnight'),
  v.literal('forest'),
  v.literal('ember'),
  v.literal('sakura'),
  v.literal('amoled'),
  v.literal('high-contrast')
)

// PaletteId — must stay in sync w/ packages/contracts/lib/theme.ts
const paletteIdValidator = v.union(
  v.literal('classic'),
  v.literal('ocean'),
  v.literal('midnight'),
  v.literal('forest'),
  v.literal('ember'),
  v.literal('sakura'),
  v.literal('twilight'),
  v.literal('high-contrast')
)

// TextStyleId — must stay in sync w/ packages/contracts/lib/theme.ts
const textStyleIdValidator = v.union(
  v.literal('default'),
  v.literal('mono'),
  v.literal('serif'),
  v.literal('rounded'),
  v.literal('display')
)

// ItemSize — must stay in sync w/ packages/contracts/workspace/settings.ts
const itemSizeValidator = v.union(
  v.literal('small'),
  v.literal('medium'),
  v.literal('large')
)

// ItemShape — must stay in sync w/ packages/contracts/workspace/settings.ts
const itemShapeValidator = v.union(
  v.literal('square'),
  v.literal('rounded'),
  v.literal('circle')
)

// LabelWidth — must stay in sync w/ packages/contracts/workspace/settings.ts
const labelWidthValidator = v.union(
  v.literal('narrow'),
  v.literal('default'),
  v.literal('wide')
)

// TierLabelFontSize — must stay in sync w/ packages/contracts/workspace/settings.ts
const tierLabelFontSizeValidator = v.union(
  v.literal('xs'),
  v.literal('small'),
  v.literal('medium'),
  v.literal('large'),
  v.literal('xl')
)

// ToolbarPosition — must stay in sync w/ packages/contracts/workspace/settings.ts
const toolbarPositionValidator = v.union(
  v.literal('top'),
  v.literal('bottom'),
  v.literal('left'),
  v.literal('right')
)

// full AppSettings shape — must stay in sync w/ packages/contracts/workspace/settings.ts
export const appSettingsValidator = v.object({
  itemSize: itemSizeValidator,
  showLabels: v.boolean(),
  itemShape: itemShapeValidator,
  compactMode: v.boolean(),
  exportBackgroundOverride: v.union(v.string(), v.null()),
  boardBackgroundOverride: v.union(v.string(), v.null()),
  labelWidth: labelWidthValidator,
  hideRowControls: v.boolean(),
  confirmBeforeDelete: v.boolean(),
  themeId: themeIdValidator,
  paletteId: paletteIdValidator,
  textStyleId: textStyleIdValidator,
  tierLabelBold: v.boolean(),
  tierLabelItalic: v.boolean(),
  tierLabelFontSize: tierLabelFontSizeValidator,
  boardLocked: v.boolean(),
  reducedMotion: v.boolean(),
  preHighContrastThemeId: v.union(themeIdValidator, v.null()),
  preHighContrastPaletteId: v.union(paletteIdValidator, v.null()),
  toolbarPosition: toolbarPositionValidator,
  showAltTextButton: v.boolean(),
})

// compile-time coverage check — any AppSettings field added, removed, or
// renamed that isn't reflected in appSettingsValidator will fail the build.
// _Assert<true> type-checks only when the conditional resolves to `true`,
// turning a silent drift into a tsc error at the schema boundary
type _Assert<T extends true> = T
type _AppSettingsValidatorInfer = Infer<typeof appSettingsValidator>
export type _AppSettingsCovers = _Assert<
  AppSettings extends _AppSettingsValidatorInfer ? true : false
>
export type _AppSettingsNoExtra = _Assert<
  _AppSettingsValidatorInfer extends AppSettings ? true : false
>
