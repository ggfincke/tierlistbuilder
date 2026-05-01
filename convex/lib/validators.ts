// convex/lib/validators.ts
// reusable v.object() validators that mirror packages/contracts shapes

import type { Infer, Validator } from 'convex/values'
import { v } from 'convex/values'
import { paginationResultValidator } from 'convex/server'
import {
  ITEM_SHAPES,
  ITEM_SIZES,
  LABEL_WIDTHS,
  TIER_LABEL_FONT_SIZES,
  TOOLBAR_POSITIONS,
  type AppPreferences,
  type CloudPreferencesRead,
} from '@tierlistbuilder/contracts/platform/preferences'
import { USER_PLANS } from '@tierlistbuilder/contracts/platform/user'
import {
  LABEL_SCRIMS,
  LABEL_TEXT_COLORS,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from '@tierlistbuilder/contracts/marketplace/category'
import {
  MEDIA_VARIANT_KINDS,
  SUPPORTED_IMAGE_MIME_TYPES,
  type MediaVariantKind,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
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
  TEMPLATE_PUBLICATION_STATES,
  TEMPLATE_JOB_STATUSES,
  TEMPLATE_SIZE_CLASSES,
  TEMPLATE_CARD_ACCESS_STATES,
  TEMPLATE_LIST_SORTS,
  TEMPLATE_VISIBILITIES,
  type MarketplaceTemplateCount,
  type MarketplaceTemplateDetail,
  type MarketplaceTemplateDraft,
  type MarketplaceTemplateDraftListResult,
  type MarketplaceTemplateDraftTemplate,
  type MarketplaceTemplateGalleryCard,
  type MarketplaceTemplateGalleryResult,
  type MarketplaceTemplateItem,
  type MarketplaceTemplateItemsResult,
  type MarketplaceTemplateCloneJobProgress,
  type MarketplaceTemplateListResult,
  type MarketplaceTemplatePublishJobProgress,
  type MarketplaceTemplatePublishResult,
  type MarketplaceTemplateSummary,
  type MarketplaceTemplateUseResult,
  type TemplateCoverItem,
  type TemplateJobStatus,
  type TemplateListSort,
  type TemplateMediaRef,
  type TemplatePublicationState,
  type TemplateSizeClass,
  type TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  BOARD_PAUSED_REASONS,
  BOARD_CLOUD_STATES,
  BOARD_MATERIALIZATION_STATES,
  LIBRARY_BOARD_STATUSES,
  LIBRARY_BOARD_VISIBILITIES,
  type BoardListItem,
  type BoardCloudState,
  type DeletedBoardListItem,
  type LibraryBoardListItem,
  type BoardMaterializationState,
  type BoardPausedReason,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardState,
  CloudBoardStateTier,
  CloudBoardStateItem,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { BoardLibrarySummary } from '../workspace/boards/librarySummary'
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

// build a validator from a readonly tuple sourced in contracts.
const literalUnion = <T extends readonly [string, ...string[]]>(
  values: T
): Validator<T[number]> =>
{
  const literals = values.map((value) => v.literal(value))
  if (literals.length === 1)
  {
    return literals[0] as unknown as Validator<T[number]>
  }
  return v.union(
    ...(literals as [
      Validator<string>,
      Validator<string>,
      ...Validator<string>[],
    ])
  ) as unknown as Validator<T[number]>
}

const themeIdValidator = literalUnion(THEME_IDS)
export const paletteIdValidator = literalUnion(PALETTE_IDS)
export const textStyleIdValidator = literalUnion(TEXT_STYLE_IDS)
const itemSizeValidator = literalUnion(ITEM_SIZES)
const itemShapeValidator = literalUnion(ITEM_SHAPES)
const labelWidthValidator = literalUnion(LABEL_WIDTHS)
const tierLabelFontSizeValidator = literalUnion(TIER_LABEL_FONT_SIZES)
const toolbarPositionValidator = literalUnion(TOOLBAR_POSITIONS)
export const userPlanValidator = literalUnion(USER_PLANS)
export const templateCategoryValidator = literalUnion(TEMPLATE_CATEGORIES)
export const templateListSortValidator = literalUnion(TEMPLATE_LIST_SORTS)
export const templateVisibilityValidator = literalUnion(TEMPLATE_VISIBILITIES)
export const templateSizeClassValidator = literalUnion(TEMPLATE_SIZE_CLASSES)
export const templatePublicationStateValidator = literalUnion(
  TEMPLATE_PUBLICATION_STATES
)
export const templateJobStatusValidator = literalUnion(TEMPLATE_JOB_STATUSES)
export const templateCardAccessStateValidator = literalUnion(
  TEMPLATE_CARD_ACCESS_STATES
)
export const mediaVariantKindValidator = literalUnion(MEDIA_VARIANT_KINDS)
export const imageMimeTypeValidator = literalUnion(SUPPORTED_IMAGE_MIME_TYPES)

// shape mirrors mediaVariants table rows — denormalized onto mediaAssets
// for the cover variant tile/preview/editor summaries
export const mediaVariantSummaryValidator = v.object({
  storageId: v.id('_storage'),
  width: v.number(),
  height: v.number(),
  byteSize: v.number(),
  mimeType: v.string(),
  contentHash: v.string(),
})

// per-item manual crop transform — mirrors ItemTransform in contracts/board.
// shared between cloud board sync, template detail projections, & the seed
// action so all callers stay coupled to the same shape
export const itemTransformValidator = v.object({
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

export const templateCardMediaValidator = v.object({
  externalId: v.string(),
  ...mediaVariantSummaryValidator.fields,
})

export const templateCardCoverItemValidator = v.object({
  media: templateCardMediaValidator,
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

// full AppPreferences shape — must stay in sync w/ packages/contracts/platform/preferences.ts
export const appPreferencesValidator = v.object({
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

// compile-time coverage check — field/union drift fails the build.
type _Assert<T extends true> = T
type _Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type _AppPreferencesValidatorInfer = Infer<typeof appPreferencesValidator>
export type _AppPreferencesExact = _Assert<
  _Exact<AppPreferences, _AppPreferencesValidatorInfer>
>
export type _ThemeIdExact = _Assert<
  _Exact<ThemeId, Infer<typeof themeIdValidator>>
>
export type _PaletteIdExact = _Assert<
  _Exact<PaletteId, Infer<typeof paletteIdValidator>>
>
export type _TextStyleIdExact = _Assert<
  _Exact<TextStyleId, Infer<typeof textStyleIdValidator>>
>
export type _TierPresetTierExact = _Assert<
  _Exact<TierPresetTier, Infer<typeof tierPresetTierValidator>>
>
export type _TemplateCategoryExact = _Assert<
  _Exact<TemplateCategory, Infer<typeof templateCategoryValidator>>
>
export type _TemplateVisibilityExact = _Assert<
  _Exact<TemplateVisibility, Infer<typeof templateVisibilityValidator>>
>
export type _TemplateListSortExact = _Assert<
  _Exact<TemplateListSort, Infer<typeof templateListSortValidator>>
>
export type _TemplateSizeClassExact = _Assert<
  _Exact<TemplateSizeClass, Infer<typeof templateSizeClassValidator>>
>
export type _TemplatePublicationStateExact = _Assert<
  _Exact<
    TemplatePublicationState,
    Infer<typeof templatePublicationStateValidator>
  >
>
export type _TemplateJobStatusExact = _Assert<
  _Exact<TemplateJobStatus, Infer<typeof templateJobStatusValidator>>
>
export type _BoardCloudStateExact = _Assert<
  _Exact<BoardCloudState, Infer<typeof boardCloudStateValidator>>
>
export type _BoardMaterializationStateExact = _Assert<
  _Exact<
    BoardMaterializationState,
    Infer<typeof boardMaterializationStateValidator>
  >
>
export type _BoardPausedReasonExact = _Assert<
  _Exact<BoardPausedReason, Infer<typeof boardPausedReasonValidator>>
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

// status & visibility unions — mirror the LIBRARY_BOARD_* tuples in contracts
const libraryBoardStatusValidator = literalUnion(LIBRARY_BOARD_STATUSES)
const libraryBoardVisibilityValidator = literalUnion(LIBRARY_BOARD_VISIBILITIES)
export const boardCloudStateValidator = literalUnion(BOARD_CLOUD_STATES)
export const boardMaterializationStateValidator = literalUnion(
  BOARD_MATERIALIZATION_STATES
)
export const boardPausedReasonValidator = literalUnion(BOARD_PAUSED_REASONS)

// single cover-item entry on a library row — mirrors LibraryBoardCoverItem
const libraryBoardCoverItemValidator = v.object({
  label: v.union(v.string(), v.null()),
  externalId: v.string(),
  mediaUrl: v.union(v.string(), v.null()),
})

// per-tier breakdown row — mirrors LibraryBoardTierBreakdown
const libraryBoardTierBreakdownValidator = v.object({
  tierIndex: v.number(),
  itemCount: v.number(),
  colorSpec: tierColorSpecValidator,
})

export const boardLibrarySummaryValidator = v.object({
  coverItems: v.array(
    v.object({
      label: v.union(v.string(), v.null()),
      externalId: v.string(),
      storageId: v.union(v.id('_storage'), v.null()),
    })
  ),
  tierColors: v.array(tierColorSpecValidator),
  tierBreakdown: v.array(libraryBoardTierBreakdownValidator),
})

// enriched my-lists library row — mirrors LibraryBoardListItem in contracts
export const libraryBoardListItemValidator = v.object({
  externalId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  revision: v.number(),
  activeItemCount: v.number(),
  unrankedItemCount: v.number(),
  rankedItemCount: v.number(),
  status: libraryBoardStatusValidator,
  visibility: libraryBoardVisibilityValidator,
  category: templateCategoryValidator,
  sourceTemplateSizeClass: v.union(templateSizeClassValidator, v.null()),
  coverItems: v.array(libraryBoardCoverItemValidator),
  paletteId: paletteIdValidator,
  tierColors: v.array(tierColorSpecValidator),
  tierBreakdown: v.array(libraryBoardTierBreakdownValidator),
  pinned: v.boolean(),
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

// label scrim/color — mirrors contracts/workspace/board union types
export const labelScrimValidator = literalUnion(LABEL_SCRIMS)
export const labelTextColorValidator = literalUnion(LABEL_TEXT_COLORS)

// label placement — discriminated union mirroring LabelPlacement in
// contracts/board. overlay carries normalized (x, y) coordinates; the two
// caption modes are inline strips & don't need coordinates
export const labelPlacementValidator = v.union(
  v.object({
    mode: v.literal('overlay'),
    x: v.number(),
    y: v.number(),
  }),
  v.object({ mode: v.literal('captionAbove') }),
  v.object({ mode: v.literal('captionBelow') })
)

// per-tile label override — mirrors ItemLabelOptions in contracts/board
export const itemLabelOptionsValidator = v.object({
  visible: v.optional(v.boolean()),
  placement: v.optional(labelPlacementValidator),
  scrim: v.optional(labelScrimValidator),
  // numeric override; validated at the server boundary too. range mirrors
  // contracts/board LABEL_FONT_SIZE_PX_MIN..MAX (8..48)
  fontSizePx: v.optional(v.number()),
  textStyleId: v.optional(textStyleIdValidator),
  textColor: v.optional(labelTextColorValidator),
})

// per-board label defaults — mirrors BoardLabelSettings in contracts/board
export const boardLabelSettingsValidator = v.object({
  show: v.optional(v.boolean()),
  placement: v.optional(labelPlacementValidator),
  scrim: v.optional(labelScrimValidator),
  fontSizePx: v.optional(v.number()),
  textStyleId: v.optional(textStyleIdValidator),
  textColor: v.optional(labelTextColorValidator),
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
  sourceMediaContentHash: v.optional(v.string()),
  order: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  aspectRatio: v.optional(v.number()),
  imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
  transform: v.optional(itemTransformValidator),
  labelOptions: v.optional(itemLabelOptionsValidator),
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
  paletteId: v.optional(paletteIdValidator),
  textStyleId: v.optional(textStyleIdValidator),
  pageBackground: v.optional(v.string()),
  labels: v.optional(boardLabelSettingsValidator),
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

// preferences read payload — mirrors the shape returned by getMyPreferences
export const cloudPreferencesReadValidator = v.object({
  preferences: appPreferencesValidator,
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

export const templateCoverItemValidator = v.object({
  media: templateMediaRefValidator,
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

const marketplaceTemplateBaseFields = {
  slug: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  category: templateCategoryValidator,
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  sizeClass: templateSizeClassValidator,
  publicationState: templatePublicationStateValidator,
  author: templateAuthorValidator,
  coverMedia: v.union(templateMediaRefValidator, v.null()),
  itemCount: v.number(),
  useCount: v.number(),
  viewCount: v.number(),
  featuredRank: v.union(v.number(), v.null()),
  creditLine: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
}

const marketplaceTemplateSummaryFields = {
  ...marketplaceTemplateBaseFields,
  coverItems: v.array(templateCoverItemValidator),
  itemAspectRatio: v.union(v.number(), v.null()),
  defaultItemImageFit: v.union(
    v.literal('cover'),
    v.literal('contain'),
    v.null()
  ),
}

export const marketplaceTemplateSummaryValidator = v.object(
  marketplaceTemplateSummaryFields
)

export const marketplaceTemplateGalleryCardValidator = v.object({
  ...marketplaceTemplateSummaryFields,
  access: templateCardAccessStateValidator,
})

export const marketplaceTemplateCountValidator = v.object({
  count: v.number(),
  countByCategory: v.record(v.string(), v.number()),
})

export const marketplaceTemplateGalleryResultValidator = v.object({
  featured: v.array(marketplaceTemplateGalleryCardValidator),
  popular: v.array(marketplaceTemplateGalleryCardValidator),
  recent: v.array(marketplaceTemplateGalleryCardValidator),
  results: v.array(marketplaceTemplateGalleryCardValidator),
  templateCount: marketplaceTemplateCountValidator,
})

export const marketplaceTemplateDraftTemplateValidator = v.object({
  slug: v.string(),
  title: v.string(),
  category: templateCategoryValidator,
  coverMedia: v.union(templateMediaRefValidator, v.null()),
  coverItems: v.array(templateCoverItemValidator),
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
  transform: v.union(itemTransformValidator, v.null()),
})

export const marketplaceTemplateDetailValidator = v.object({
  ...marketplaceTemplateSummaryFields,
  access: templateCardAccessStateValidator,
  suggestedTiers: tierPresetTiersValidator,
  labels: v.union(boardLabelSettingsValidator, v.null()),
})

export const marketplaceTemplateItemsResultValidator =
  paginationResultValidator(marketplaceTemplateItemValidator)

export const marketplaceTemplateListResultValidator = v.object({
  items: v.array(marketplaceTemplateSummaryValidator),
})

export const marketplaceTemplateDraftValidator = v.object({
  boardExternalId: v.string(),
  boardTitle: v.string(),
  updatedAt: v.number(),
  activeItemCount: v.number(),
  rankedItemCount: v.number(),
  unrankedItemCount: v.number(),
  progressPercent: v.number(),
  template: marketplaceTemplateDraftTemplateValidator,
})

export const marketplaceTemplateDraftListResultValidator = v.object({
  drafts: v.array(marketplaceTemplateDraftValidator),
})

const marketplaceTemplateJobProgressFields = {
  jobId: v.string(),
  status: templateJobStatusValidator,
  itemCount: v.number(),
  processedItemCount: v.number(),
  errorCode: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  startedAt: v.union(v.number(), v.null()),
  completedAt: v.union(v.number(), v.null()),
  canceledAt: v.union(v.number(), v.null()),
}

export const marketplaceTemplatePublishJobProgressValidator = v.object({
  ...marketplaceTemplateJobProgressFields,
  kind: v.literal('publish'),
  slug: v.string(),
})

export const marketplaceTemplateCloneJobProgressValidator = v.object({
  ...marketplaceTemplateJobProgressFields,
  kind: v.literal('clone'),
  boardExternalId: v.string(),
})

export const marketplaceTemplatePublishResultValidator = v.union(
  v.object({
    status: v.literal('published'),
    slug: v.string(),
  }),
  v.object({
    status: v.literal('jobQueued'),
    slug: v.string(),
    jobId: v.string(),
  })
)

export const marketplaceTemplateUseResultValidator = v.union(
  v.object({
    status: v.literal('ready'),
    boardExternalId: v.string(),
  }),
  v.object({
    status: v.literal('jobQueued'),
    boardExternalId: v.string(),
    jobId: v.string(),
  })
)

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

export type _LibraryBoardListItemCovers = _Assert<
  LibraryBoardListItem extends Infer<typeof libraryBoardListItemValidator>
    ? true
    : false
>
export type _LibraryBoardListItemNoExtra = _Assert<
  Infer<typeof libraryBoardListItemValidator> extends LibraryBoardListItem
    ? true
    : false
>

export type _BoardLibrarySummaryCovers = _Assert<
  BoardLibrarySummary extends Infer<typeof boardLibrarySummaryValidator>
    ? true
    : false
>
export type _BoardLibrarySummaryNoExtra = _Assert<
  Infer<typeof boardLibrarySummaryValidator> extends BoardLibrarySummary
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

export type _TemplateCoverItemCovers = _Assert<
  TemplateCoverItem extends Infer<typeof templateCoverItemValidator>
    ? true
    : false
>
export type _TemplateCoverItemNoExtra = _Assert<
  Infer<typeof templateCoverItemValidator> extends TemplateCoverItem
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

export type _MarketplaceTemplateGalleryCardCovers = _Assert<
  MarketplaceTemplateGalleryCard extends Infer<
    typeof marketplaceTemplateGalleryCardValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateGalleryCardNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateGalleryCardValidator
  > extends MarketplaceTemplateGalleryCard
    ? true
    : false
>

export type _MarketplaceTemplateCountCovers = _Assert<
  MarketplaceTemplateCount extends Infer<
    typeof marketplaceTemplateCountValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateCountNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateCountValidator
  > extends MarketplaceTemplateCount
    ? true
    : false
>

export type _MarketplaceTemplateGalleryResultCovers = _Assert<
  MarketplaceTemplateGalleryResult extends Infer<
    typeof marketplaceTemplateGalleryResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateGalleryResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateGalleryResultValidator
  > extends MarketplaceTemplateGalleryResult
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

export type _MarketplaceTemplateItemsResultCovers = _Assert<
  MarketplaceTemplateItemsResult extends Infer<
    typeof marketplaceTemplateItemsResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateItemsResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateItemsResultValidator
  > extends MarketplaceTemplateItemsResult
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

export type _MarketplaceTemplateDraftTemplateCovers = _Assert<
  MarketplaceTemplateDraftTemplate extends Infer<
    typeof marketplaceTemplateDraftTemplateValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateDraftTemplateNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateDraftTemplateValidator
  > extends MarketplaceTemplateDraftTemplate
    ? true
    : false
>

export type _MarketplaceTemplateDraftCovers = _Assert<
  MarketplaceTemplateDraft extends Infer<
    typeof marketplaceTemplateDraftValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateDraftNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateDraftValidator
  > extends MarketplaceTemplateDraft
    ? true
    : false
>

export type _MarketplaceTemplateDraftListResultCovers = _Assert<
  MarketplaceTemplateDraftListResult extends Infer<
    typeof marketplaceTemplateDraftListResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateDraftListResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateDraftListResultValidator
  > extends MarketplaceTemplateDraftListResult
    ? true
    : false
>

export type _MarketplaceTemplatePublishJobProgressCovers = _Assert<
  MarketplaceTemplatePublishJobProgress extends Infer<
    typeof marketplaceTemplatePublishJobProgressValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplatePublishJobProgressNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplatePublishJobProgressValidator
  > extends MarketplaceTemplatePublishJobProgress
    ? true
    : false
>

export type _MarketplaceTemplateCloneJobProgressCovers = _Assert<
  MarketplaceTemplateCloneJobProgress extends Infer<
    typeof marketplaceTemplateCloneJobProgressValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateCloneJobProgressNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateCloneJobProgressValidator
  > extends MarketplaceTemplateCloneJobProgress
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

export type _CloudPreferencesReadCovers = _Assert<
  CloudPreferencesRead extends Infer<typeof cloudPreferencesReadValidator>
    ? true
    : false
>
export type _CloudPreferencesReadNoExtra = _Assert<
  Infer<typeof cloudPreferencesReadValidator> extends CloudPreferencesRead
    ? true
    : false
>

export type _MediaVariantKindCovers = _Assert<
  MediaVariantKind extends Infer<typeof mediaVariantKindValidator>
    ? true
    : false
>
export type _MediaVariantKindNoExtra = _Assert<
  Infer<typeof mediaVariantKindValidator> extends MediaVariantKind
    ? true
    : false
>

export type _SupportedImageMimeTypeCovers = _Assert<
  SupportedImageMimeType extends Infer<typeof imageMimeTypeValidator>
    ? true
    : false
>
export type _SupportedImageMimeTypeNoExtra = _Assert<
  Infer<typeof imageMimeTypeValidator> extends SupportedImageMimeType
    ? true
    : false
>
