// convex/lib/validators.ts
// reusable v.object() validators that mirror packages/contracts shapes

import type { Infer } from 'convex/values'
import { v } from 'convex/values'
import type {
  AppSettings,
  CloudSettingsRead,
} from '@tierlistbuilder/contracts/workspace/settings'
import type {
  PaletteId,
  TextStyleId,
  ThemeId,
} from '@tierlistbuilder/contracts/lib/theme'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type {
  BoardListItem,
  DeletedBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardState,
  CloudBoardStateTier,
  CloudBoardStateItem,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import type {
  OwnedShortLinkListItem,
  ShortLinkResolveResult,
} from '@tierlistbuilder/contracts/platform/shortLink'

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

// single tier inside a reusable preset — mirrors TierPresetTier in packages/contracts.
// exported so the full-shape _Assert check below can reach it
export const tierPresetTierValidator = v.object({
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

// compile-time coverage check — AppSettings fields added, removed, or renamed
// w/o updating appSettingsValidator fail the build via _Assert<true>
type _Assert<T extends true> = T
type _AppSettingsValidatorInfer = Infer<typeof appSettingsValidator>
export type _AppSettingsCovers = _Assert<
  AppSettings extends _AppSettingsValidatorInfer ? true : false
>
export type _AppSettingsNoExtra = _Assert<
  _AppSettingsValidatorInfer extends AppSettings ? true : false
>

// same coverage discipline for theme/palette/text-style & tier-preset-tier shape —
// contract-side renames or union additions not reflected here fail the build.
// each pair asserts both directions (no missing members, no extras)
export type _ThemeIdCovers = _Assert<
  ThemeId extends Infer<typeof themeIdValidator> ? true : false
>
export type _ThemeIdNoExtra = _Assert<
  Infer<typeof themeIdValidator> extends ThemeId ? true : false
>

export type _PaletteIdCovers = _Assert<
  PaletteId extends Infer<typeof paletteIdValidator> ? true : false
>
export type _PaletteIdNoExtra = _Assert<
  Infer<typeof paletteIdValidator> extends PaletteId ? true : false
>

export type _TextStyleIdCovers = _Assert<
  TextStyleId extends Infer<typeof textStyleIdValidator> ? true : false
>
export type _TextStyleIdNoExtra = _Assert<
  Infer<typeof textStyleIdValidator> extends TextStyleId ? true : false
>

export type _TierPresetTierCovers = _Assert<
  TierPresetTier extends Infer<typeof tierPresetTierValidator> ? true : false
>
export type _TierPresetTierNoExtra = _Assert<
  Infer<typeof tierPresetTierValidator> extends TierPresetTier ? true : false
>

// return-value validators — used by `returns:` on queries & mutations so the
// server-side contract stays coupled to the wire type. shapes mirror the
// contracts-package types; coverage asserts at the bottom enforce drift

// single active-board list row — mirrors BoardListItem
export const boardListItemValidator = v.object({
  externalId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  revision: v.number(),
})

// list row for soft-deleted boards — mirrors DeletedBoardListItem
export const deletedBoardListItemValidator = v.object({
  externalId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  revision: v.number(),
  deletedAt: v.number(),
})

// tier row in a cloud board state payload — mirrors CloudBoardStateTier
const cloudBoardStateTierValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.optional(tierColorSpecValidator),
  itemIds: v.array(v.string()),
  order: v.number(),
})

// item row in a cloud board state payload — mirrors CloudBoardStateItem
const cloudBoardStateItemValidator = v.object({
  externalId: v.string(),
  tierId: v.union(v.string(), v.null()),
  label: v.optional(v.string()),
  backgroundColor: v.optional(v.string()),
  altText: v.optional(v.string()),
  mediaExternalId: v.optional(v.union(v.string(), v.null())),
  mediaContentHash: v.optional(v.string()),
  order: v.number(),
  deletedAt: v.union(v.number(), v.null()),
})

// full cloud board state payload — mirrors CloudBoardState
export const cloudBoardStateValidator = v.object({
  title: v.string(),
  revision: v.number(),
  tiers: v.array(cloudBoardStateTierValidator),
  items: v.array(cloudBoardStateItemValidator),
})

// single tier preset row as returned by getMyTierPresets — mirrors TierPresetCloudRow
export const tierPresetCloudRowValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  tiers: tierPresetTiersValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
})

// settings read payload — mirrors the shape returned by getMySettings
export const cloudSettingsReadValidator = v.object({
  settings: appSettingsValidator,
  updatedAt: v.number(),
})

// short link resolve result — mirrors ShortLinkResolveResult union
export const shortLinkResolveResultValidator = v.union(
  v.object({ kind: v.literal('not-found') }),
  v.object({
    kind: v.literal('snapshot'),
    snapshotUrl: v.string(),
    createdAt: v.number(),
  })
)

// owned short link list row — mirrors OwnedShortLinkListItem
export const ownedShortLinkListItemValidator = v.object({
  slug: v.string(),
  boardTitle: v.union(v.string(), v.null()),
  createdAt: v.number(),
  expiresAt: v.union(v.number(), v.null()),
})

// coverage asserts — contract-side renames or added fields not reflected in
// the validators above fail the build. each pair covers both directions
export type _BoardListItemCovers = _Assert<
  BoardListItem extends Infer<typeof boardListItemValidator> ? true : false
>
export type _BoardListItemNoExtra = _Assert<
  Infer<typeof boardListItemValidator> extends BoardListItem ? true : false
>

export type _DeletedBoardListItemCovers = _Assert<
  DeletedBoardListItem extends Infer<typeof deletedBoardListItemValidator>
    ? true
    : false
>
export type _DeletedBoardListItemNoExtra = _Assert<
  Infer<typeof deletedBoardListItemValidator> extends DeletedBoardListItem
    ? true
    : false
>

export type _CloudBoardStateTierCovers = _Assert<
  CloudBoardStateTier extends Infer<typeof cloudBoardStateTierValidator>
    ? true
    : false
>
export type _CloudBoardStateTierNoExtra = _Assert<
  Infer<typeof cloudBoardStateTierValidator> extends CloudBoardStateTier
    ? true
    : false
>

export type _CloudBoardStateItemCovers = _Assert<
  CloudBoardStateItem extends Infer<typeof cloudBoardStateItemValidator>
    ? true
    : false
>
export type _CloudBoardStateItemNoExtra = _Assert<
  Infer<typeof cloudBoardStateItemValidator> extends CloudBoardStateItem
    ? true
    : false
>

export type _CloudBoardStateCovers = _Assert<
  CloudBoardState extends Infer<typeof cloudBoardStateValidator> ? true : false
>
export type _CloudBoardStateNoExtra = _Assert<
  Infer<typeof cloudBoardStateValidator> extends CloudBoardState ? true : false
>

export type _TierPresetCloudRowCovers = _Assert<
  TierPresetCloudRow extends Infer<typeof tierPresetCloudRowValidator>
    ? true
    : false
>
export type _TierPresetCloudRowNoExtra = _Assert<
  Infer<typeof tierPresetCloudRowValidator> extends TierPresetCloudRow
    ? true
    : false
>

export type _ShortLinkResolveResultCovers = _Assert<
  ShortLinkResolveResult extends Infer<typeof shortLinkResolveResultValidator>
    ? true
    : false
>
export type _ShortLinkResolveResultNoExtra = _Assert<
  Infer<typeof shortLinkResolveResultValidator> extends ShortLinkResolveResult
    ? true
    : false
>

export type _OwnedShortLinkListItemCovers = _Assert<
  OwnedShortLinkListItem extends Infer<typeof ownedShortLinkListItemValidator>
    ? true
    : false
>
export type _OwnedShortLinkListItemNoExtra = _Assert<
  Infer<typeof ownedShortLinkListItemValidator> extends OwnedShortLinkListItem
    ? true
    : false
>

export type _CloudSettingsReadCovers = _Assert<
  CloudSettingsRead extends Infer<typeof cloudSettingsReadValidator>
    ? true
    : false
>
export type _CloudSettingsReadNoExtra = _Assert<
  Infer<typeof cloudSettingsReadValidator> extends CloudSettingsRead
    ? true
    : false
>
