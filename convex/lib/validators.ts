// convex/lib/validators.ts
// reusable v.object() validators that mirror packages/contracts shapes

import type { Infer, Validator } from 'convex/values'
import { v } from 'convex/values'
import {
  ITEM_SHAPES,
  ITEM_SIZES,
  LABEL_WIDTHS,
  TIER_LABEL_FONT_SIZES,
  TOOLBAR_POSITIONS,
  type AppSettings,
  type CloudSettingsRead,
} from '@tierlistbuilder/contracts/workspace/settings'
import {
  PALETTE_IDS,
  TEXT_STYLE_IDS,
  THEME_IDS,
  type PaletteId,
  type TextStyleId,
  type ThemeId,
} from '@tierlistbuilder/contracts/lib/theme'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LIST_SORTS,
  TEMPLATE_VISIBILITIES,
  type MarketplaceTemplateDetail,
  type MarketplaceTemplateItem,
  type MarketplaceTemplateListResult,
  type MarketplaceTemplatePublishResult,
  type MarketplaceTemplateSummary,
  type MarketplaceTemplateUseResult,
  type TemplateCategory,
  type TemplateListSort,
  type TemplateMediaRef,
  type TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
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

// build a v.union of v.literal() from a readonly tuple sourced in contracts.
// the _Assert pairs below still catch drift in either direction at compile time
const literalUnion = <T extends readonly [string, string, ...string[]]>(
  values: T
): Validator<T[number]> =>
  v.union(...values.map((value) => v.literal(value))) as unknown as Validator<
    T[number]
  >

const themeIdValidator = literalUnion(THEME_IDS)
const paletteIdValidator = literalUnion(PALETTE_IDS)
const textStyleIdValidator = literalUnion(TEXT_STYLE_IDS)
const itemSizeValidator = literalUnion(ITEM_SIZES)
const itemShapeValidator = literalUnion(ITEM_SHAPES)
const labelWidthValidator = literalUnion(LABEL_WIDTHS)
const tierLabelFontSizeValidator = literalUnion(TIER_LABEL_FONT_SIZES)
const toolbarPositionValidator = literalUnion(TOOLBAR_POSITIONS)
export const templateCategoryValidator = literalUnion(TEMPLATE_CATEGORIES)
export const templateListSortValidator = literalUnion(TEMPLATE_LIST_SORTS)
export const templateVisibilityValidator = literalUnion(TEMPLATE_VISIBILITIES)

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
  toolbarPosition: toolbarPositionValidator,
  showAltTextButton: v.boolean(),
  autoCropTrimSoftShadows: v.boolean(),
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

export type _TemplateCategoryCovers = _Assert<
  TemplateCategory extends Infer<typeof templateCategoryValidator>
    ? true
    : false
>
export type _TemplateCategoryNoExtra = _Assert<
  Infer<typeof templateCategoryValidator> extends TemplateCategory
    ? true
    : false
>
export type _TemplateVisibilityCovers = _Assert<
  TemplateVisibility extends Infer<typeof templateVisibilityValidator>
    ? true
    : false
>
export type _TemplateVisibilityNoExtra = _Assert<
  Infer<typeof templateVisibilityValidator> extends TemplateVisibility
    ? true
    : false
>
export type _TemplateListSortCovers = _Assert<
  TemplateListSort extends Infer<typeof templateListSortValidator>
    ? true
    : false
>
export type _TemplateListSortNoExtra = _Assert<
  Infer<typeof templateListSortValidator> extends TemplateListSort
    ? true
    : false
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
  sourceMediaExternalId: v.optional(v.union(v.string(), v.null())),
  mediaContentHash: v.optional(v.string()),
  sourceMediaContentHash: v.optional(v.string()),
  order: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  aspectRatio: v.optional(v.number()),
  imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
  transform: v.optional(
    v.object({
      rotation: v.union(
        v.literal(0),
        v.literal(90),
        v.literal(180),
        v.literal(270)
      ),
      zoom: v.number(),
      offsetX: v.number(),
      offsetY: v.number(),
    })
  ),
})

// full cloud board state payload — mirrors CloudBoardState
export const cloudBoardStateValidator = v.object({
  title: v.string(),
  revision: v.number(),
  itemAspectRatio: v.optional(v.number()),
  itemAspectRatioMode: v.optional(
    v.union(v.literal('auto'), v.literal('manual'))
  ),
  aspectRatioPromptDismissed: v.optional(v.boolean()),
  defaultItemImageFit: v.optional(
    v.union(v.literal('cover'), v.literal('contain'))
  ),
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
  boardTitle: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
})

export const templateAuthorValidator = v.object({
  id: v.string(),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
})

export const templateMediaRefValidator = v.object({
  externalId: v.string(),
  contentHash: v.string(),
  url: v.string(),
  width: v.number(),
  height: v.number(),
  mimeType: v.string(),
})

const marketplaceTemplateBaseFields = {
  slug: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  category: templateCategoryValidator,
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  author: templateAuthorValidator,
  coverMedia: v.union(templateMediaRefValidator, v.null()),
  itemCount: v.number(),
  useCount: v.number(),
  viewCount: v.number(),
  featuredRank: v.union(v.number(), v.null()),
  creditLine: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  unpublishedAt: v.union(v.number(), v.null()),
}

export const marketplaceTemplateSummaryValidator = v.object({
  ...marketplaceTemplateBaseFields,
  coverItems: v.array(templateMediaRefValidator),
})

export const marketplaceTemplateItemValidator = v.object({
  externalId: v.string(),
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  altText: v.union(v.string(), v.null()),
  media: v.union(templateMediaRefValidator, v.null()),
  order: v.number(),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
  transform: v.union(
    v.object({
      rotation: v.union(
        v.literal(0),
        v.literal(90),
        v.literal(180),
        v.literal(270)
      ),
      zoom: v.number(),
      offsetX: v.number(),
      offsetY: v.number(),
    }),
    v.null()
  ),
})

export const marketplaceTemplateDetailValidator = v.object({
  ...marketplaceTemplateBaseFields,
  suggestedTiers: tierPresetTiersValidator,
  items: v.array(marketplaceTemplateItemValidator),
})

export const marketplaceTemplateListResultValidator = v.object({
  items: v.array(marketplaceTemplateSummaryValidator),
})

export const marketplaceTemplatePublishResultValidator = v.object({
  slug: v.string(),
})

export const marketplaceTemplateUseResultValidator = v.object({
  boardExternalId: v.string(),
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

export type _TemplateMediaRefCovers = _Assert<
  TemplateMediaRef extends Infer<typeof templateMediaRefValidator>
    ? true
    : false
>
export type _TemplateMediaRefNoExtra = _Assert<
  Infer<typeof templateMediaRefValidator> extends TemplateMediaRef
    ? true
    : false
>

export type _MarketplaceTemplateSummaryCovers = _Assert<
  MarketplaceTemplateSummary extends Infer<
    typeof marketplaceTemplateSummaryValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateSummaryNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateSummaryValidator
  > extends MarketplaceTemplateSummary
    ? true
    : false
>

export type _MarketplaceTemplateItemCovers = _Assert<
  MarketplaceTemplateItem extends Infer<typeof marketplaceTemplateItemValidator>
    ? true
    : false
>
export type _MarketplaceTemplateItemNoExtra = _Assert<
  Infer<typeof marketplaceTemplateItemValidator> extends MarketplaceTemplateItem
    ? true
    : false
>

export type _MarketplaceTemplateDetailCovers = _Assert<
  MarketplaceTemplateDetail extends Infer<
    typeof marketplaceTemplateDetailValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateDetailNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateDetailValidator
  > extends MarketplaceTemplateDetail
    ? true
    : false
>

export type _MarketplaceTemplateListResultCovers = _Assert<
  MarketplaceTemplateListResult extends Infer<
    typeof marketplaceTemplateListResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateListResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateListResultValidator
  > extends MarketplaceTemplateListResult
    ? true
    : false
>

export type _MarketplaceTemplatePublishResultCovers = _Assert<
  MarketplaceTemplatePublishResult extends Infer<
    typeof marketplaceTemplatePublishResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplatePublishResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplatePublishResultValidator
  > extends MarketplaceTemplatePublishResult
    ? true
    : false
>

export type _MarketplaceTemplateUseResultCovers = _Assert<
  MarketplaceTemplateUseResult extends Infer<
    typeof marketplaceTemplateUseResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateUseResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateUseResultValidator
  > extends MarketplaceTemplateUseResult
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
