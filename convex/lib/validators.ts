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
  LABEL_PLACEMENT_MODES,
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
  TEMPLATE_GALLERY_RAILS,
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
  type MarketplaceTemplateGalleryRailResult,
  type MarketplaceTemplateGalleryResult,
  type MarketplaceTemplateGalleryResultsResult,
  type MarketplaceTemplateBookmarkListItem,
  type MarketplaceTemplateBookmarkListResult,
  type MarketplaceTemplateBookmarkState,
  type MarketplaceTemplateItem,
  type MarketplaceTemplateItemsResult,
  type MarketplaceTemplateCloneJobProgress,
  type MarketplaceTemplateListResult,
  type MarketplaceTemplateManagementItem,
  type MarketplaceTemplateManagementListResult,
  type MarketplaceTemplatePublishJobProgress,
  type MarketplaceTemplatePublishResult,
  type MarketplaceTemplateSummary,
  type MarketplaceTemplateUseResult,
  type TemplateCoverItem,
  type TemplateJobStatus,
  type TemplateGalleryRail,
  type TemplateListSort,
  type TemplateMediaRef,
  type TemplatePublicationState,
  type TemplateSizeClass,
  type TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  TEMPLATE_CRITERION_STATUSES,
  type MarketplaceTemplateCriterion,
  type MarketplaceTemplateCriterionSnapshot,
  type TemplateCriterionStatus,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  RANKING_FEATURED_BADGES,
  RANKING_LIST_SORTS,
  RANKING_PUBLICATION_STATES,
  RANKING_PUBLISH_BLOCK_REASONS,
  RANKING_VISIBILITIES,
  type MarketplaceMyRankingForTemplateResult,
  type MarketplaceRankingPublishAvailability,
  type MarketplaceRankingDetail,
  type MarketplaceRankingItem,
  type MarketplaceRankingListResult,
  type MarketplaceRankingPaginatedResult,
  type MarketplaceRankingPublishResult,
  type MarketplaceRankingRemixResult,
  type MarketplaceRankingSummary,
  type MarketplaceRankingTier,
  type RankingListSort,
  type RankingPublishBlockReason,
  type RankingPublicationState,
  type RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  TEMPLATE_RANKING_AGGREGATE_ITEM_BANDS,
  TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS,
  TEMPLATE_RANKING_AGGREGATE_STATES,
  type MarketplaceTemplateRankingAggregate,
  type MarketplaceTemplateRankingAggregateBucket,
  type MarketplaceTemplateRankingAggregateDistributionCell,
  type MarketplaceTemplateRankingAggregateItem,
  type MarketplaceTemplateRankingAggregateItemsResult,
  type MarketplaceTemplateRankingAggregateTemplateRef,
  type TemplateRankingAggregateItemBand,
  type TemplateRankingAggregateItemSort,
  type TemplateRankingAggregateState,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  SEED_RANKING_RELEASE_STATUSES,
  SEED_RUN_STATUSES,
  SEED_TEMPLATE_RELEASE_STATUSES,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import {
  BOARD_PAUSED_REASONS,
  BOARD_CLOUD_STATES,
  BOARD_MATERIALIZATION_STATES,
  PUBLISH_STATES,
  SYNC_STATES,
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
export const literalUnion = <T extends readonly [string, ...string[]]>(
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
const labelPlacementModeValidator = literalUnion(LABEL_PLACEMENT_MODES)
export const userPlanValidator = literalUnion(USER_PLANS)
export const templateCategoryValidator = literalUnion(TEMPLATE_CATEGORIES)
export const templateListSortValidator = literalUnion(TEMPLATE_LIST_SORTS)
export const templateVisibilityValidator = literalUnion(TEMPLATE_VISIBILITIES)
export const rankingListSortValidator = literalUnion(RANKING_LIST_SORTS)
export const templateSizeClassValidator = literalUnion(TEMPLATE_SIZE_CLASSES)
export const templatePublicationStateValidator = literalUnion(
  TEMPLATE_PUBLICATION_STATES
)
export const templateJobStatusValidator = literalUnion(TEMPLATE_JOB_STATUSES)
export const templateGalleryRailValidator = literalUnion(TEMPLATE_GALLERY_RAILS)
export const templateCriterionStatusValidator = literalUnion(
  TEMPLATE_CRITERION_STATUSES
)
export const rankingVisibilityValidator = literalUnion(RANKING_VISIBILITIES)
export const rankingPublicationStateValidator = literalUnion(
  RANKING_PUBLICATION_STATES
)
export const rankingPublishBlockReasonValidator = literalUnion(
  RANKING_PUBLISH_BLOCK_REASONS
)
export const rankingFeaturedBadgeValidator = literalUnion(
  RANKING_FEATURED_BADGES
)
export const templateRankingAggregateStateValidator = literalUnion(
  TEMPLATE_RANKING_AGGREGATE_STATES
)
export const templateRankingAggregateItemSortValidator = literalUnion(
  TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS
)
export const templateRankingAggregateItemBandValidator = literalUnion(
  TEMPLATE_RANKING_AGGREGATE_ITEM_BANDS
)
export const seedRunStatusValidator = literalUnion(SEED_RUN_STATUSES)
export const seedTemplateReleaseStatusValidator = literalUnion(
  SEED_TEMPLATE_RELEASE_STATUSES
)
export const seedRankingReleaseStatusValidator = literalUnion(
  SEED_RANKING_RELEASE_STATUSES
)

export const templateRankingAggregateJobStatusValidator = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('failed')
)

export const templateRankingAggregateJobPhaseValidator = v.union(
  v.literal('seedItems'),
  v.literal('scanRankings'),
  v.literal('finalizeRelativeMetrics')
)
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

export const templateMediaRefValidator = v.object({
  externalId: v.string(),
  contentHash: v.string(),
  url: v.string(),
  width: v.number(),
  height: v.number(),
  mimeType: v.string(),
})

// source-image rect for a cover surface, normalized to source dimensions.
// values may sit outside [0, 1] when the user zooms below cover-fit (the
// renderer letterboxes the overflow w/ --t-media-matte)
export const coverFrameValidator = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
})

// per-surface framings stored on the template & denormalized onto the card
export const templateCoverFramingValidator = v.object({
  browseHero: v.union(coverFrameValidator, v.null()),
  detailHero: v.union(coverFrameValidator, v.null()),
  card: v.union(coverFrameValidator, v.null()),
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
  defaultLabelPlacementMode: labelPlacementModeValidator,
  defaultLabelFontSizePx: v.number(),
  itemShape: itemShapeValidator,
  compactMode: v.boolean(),
  exportBackgroundOverride: v.union(v.string(), v.null()),
  exportItemsPerRow: v.number(),
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
  showItemEditButton: v.boolean(),
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
export type _TemplateGalleryRailExact = _Assert<
  _Exact<TemplateGalleryRail, Infer<typeof templateGalleryRailValidator>>
>
export type _TemplateCriterionStatusExact = _Assert<
  _Exact<
    TemplateCriterionStatus,
    Infer<typeof templateCriterionStatusValidator>
  >
>
export type _RankingVisibilityExact = _Assert<
  _Exact<RankingVisibility, Infer<typeof rankingVisibilityValidator>>
>
export type _RankingListSortExact = _Assert<
  _Exact<RankingListSort, Infer<typeof rankingListSortValidator>>
>
export type _RankingPublicationStateExact = _Assert<
  _Exact<
    RankingPublicationState,
    Infer<typeof rankingPublicationStateValidator>
  >
>
export type _RankingPublishBlockReasonExact = _Assert<
  _Exact<
    RankingPublishBlockReason,
    Infer<typeof rankingPublishBlockReasonValidator>
  >
>
export type _TemplateRankingAggregateStateExact = _Assert<
  _Exact<
    TemplateRankingAggregateState,
    Infer<typeof templateRankingAggregateStateValidator>
  >
>
export type _TemplateRankingAggregateItemSortExact = _Assert<
  _Exact<
    TemplateRankingAggregateItemSort,
    Infer<typeof templateRankingAggregateItemSortValidator>
  >
>
export type _TemplateRankingAggregateItemBandExact = _Assert<
  _Exact<
    TemplateRankingAggregateItemBand,
    Infer<typeof templateRankingAggregateItemBandValidator>
  >
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

// publish/sync/visibility unions — mirror the contract tuples
const publishStateValidator = literalUnion(PUBLISH_STATES)
const syncStateValidator = literalUnion(SYNC_STATES)
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
  mediaHash: v.optional(v.string()),
  mediaCloudExternalId: v.optional(v.string()),
  mediaVariant: v.optional(mediaVariantKindValidator),
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
  publishState: publishStateValidator,
  syncState: syncStateValidator,
  visibility: libraryBoardVisibilityValidator,
  category: templateCategoryValidator,
  sourceTemplateSizeClass: v.union(templateSizeClassValidator, v.null()),
  sourceTemplateCoverMedia: v.union(templateMediaRefValidator, v.null()),
  sourceTemplateCoverFraming: v.union(templateCoverFramingValidator, v.null()),
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
  notes: v.optional(v.string()),
  mediaExternalId: v.optional(v.union(v.string(), v.null())),
  previewMediaContentHash: v.optional(v.string()),
  mediaContentHash: v.optional(v.string()),
  sourceMediaContentHash: v.optional(v.string()),
  order: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  aspectRatio: v.optional(v.number()),
  imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
  transform: v.optional(itemTransformValidator),
  labelOptions: v.optional(itemLabelOptionsValidator),
  sourceTemplateItemExternalId: v.optional(v.string()),
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
  // source-template/ranking metadata for boards created via fork or remix.
  // null when the board was started from scratch; both can be set when a
  // ranking remix populates both (the ranking's template + the ranking itself)
  sourceTemplateId: v.optional(v.union(v.string(), v.null())),
  sourceRankingId: v.optional(v.union(v.string(), v.null())),
  sourceTemplateTitle: v.optional(v.union(v.string(), v.null())),
  sourceRankingTitle: v.optional(v.union(v.string(), v.null())),
  preferredCriterionExternalId: v.optional(v.union(v.string(), v.null())),
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

export const templateCoverItemValidator = v.object({
  media: templateMediaRefValidator,
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

export const templateCriterionValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  shortName: v.union(v.string(), v.null()),
  prompt: v.string(),
  axisTop: v.union(v.string(), v.null()),
  axisBottom: v.union(v.string(), v.null()),
  order: v.number(),
  isPrimary: v.boolean(),
  status: templateCriterionStatusValidator,
})

export const templateCriterionSnapshotValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  prompt: v.string(),
})

export const templateCriteriaValidator = v.array(templateCriterionValidator)

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
  coverFraming: v.union(templateCoverFramingValidator, v.null()),
  itemCount: v.number(),
  forkCount: v.number(),
  viewCount: v.number(),
  rankingCount: v.number(),
  weeklyForkCount: v.number(),
  weeklyViewCount: v.number(),
  trendingScore: v.number(),
  trendingComputedAt: v.union(v.number(), v.null()),
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
  trending: v.array(marketplaceTemplateGalleryCardValidator),
  popular: v.array(marketplaceTemplateGalleryCardValidator),
  recent: v.array(marketplaceTemplateGalleryCardValidator),
  results: v.array(marketplaceTemplateGalleryCardValidator),
  templateCount: marketplaceTemplateCountValidator,
})

export const marketplaceTemplateGalleryRailResultValidator = v.object({
  items: v.array(marketplaceTemplateGalleryCardValidator),
})

export const marketplaceTemplateGalleryResultsResultValidator = v.object({
  results: v.array(marketplaceTemplateGalleryCardValidator),
  templateCount: marketplaceTemplateCountValidator,
})

export const marketplaceTemplateManagementItemValidator = v.object({
  ...marketplaceTemplateSummaryFields,
  isPubliclyListable: v.boolean(),
})

export const marketplaceTemplateManagementListResultValidator = v.object({
  items: v.array(marketplaceTemplateManagementItemValidator),
})

export const marketplaceTemplateDraftTemplateValidator = v.object({
  slug: v.string(),
  title: v.string(),
  category: templateCategoryValidator,
  coverMedia: v.union(templateMediaRefValidator, v.null()),
  coverFraming: v.union(templateCoverFramingValidator, v.null()),
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
  criteria: templateCriteriaValidator,
  rankingCountByCriterion: v.record(v.string(), v.number()),
  suggestedTiers: tierPresetTiersValidator,
  labels: v.union(boardLabelSettingsValidator, v.null()),
})

export const marketplaceTemplateItemsResultValidator =
  paginationResultValidator(marketplaceTemplateItemValidator)

export const marketplaceTemplateBookmarkStateValidator = v.object({
  saved: v.boolean(),
  savedAt: v.union(v.number(), v.null()),
})

export const marketplaceTemplateBookmarkListItemValidator = v.object({
  template: marketplaceTemplateSummaryValidator,
  savedAt: v.number(),
})

export const marketplaceTemplateBookmarkListResultValidator =
  paginationResultValidator(marketplaceTemplateBookmarkListItemValidator)

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

export const marketplaceRankingTemplateRefValidator = v.object({
  slug: v.string(),
  title: v.string(),
  category: templateCategoryValidator,
})

const marketplaceRankingSummaryFields = {
  slug: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  visibility: rankingVisibilityValidator,
  publicationState: rankingPublicationStateValidator,
  author: templateAuthorValidator,
  template: marketplaceRankingTemplateRefValidator,
  criterion: templateCriterionSnapshotValidator,
  itemCount: v.number(),
  tierCount: v.number(),
  remixCount: v.number(),
  viewCount: v.number(),
  featuredRank: v.union(v.number(), v.null()),
  featuredBadge: v.union(rankingFeaturedBadgeValidator, v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
}

export const marketplaceRankingSummaryValidator = v.object(
  marketplaceRankingSummaryFields
)

export const marketplaceRankingTierValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.union(tierColorSpecValidator, v.null()),
  order: v.number(),
})

export const marketplaceRankingItemValidator = v.object({
  externalId: v.string(),
  templateItemExternalId: v.string(),
  tierExternalId: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  altText: v.union(v.string(), v.null()),
  media: v.union(templateMediaRefValidator, v.null()),
  order: v.number(),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

export const marketplaceRankingDetailValidator = v.object({
  ...marketplaceRankingSummaryFields,
  tiers: v.array(marketplaceRankingTierValidator),
  items: v.array(marketplaceRankingItemValidator),
})

export const marketplaceRankingListResultValidator = v.object({
  items: v.array(marketplaceRankingSummaryValidator),
})

export const marketplaceRankingPaginatedResultValidator =
  paginationResultValidator(marketplaceRankingSummaryValidator)

export const marketplaceMyRankingForTemplateResultValidator = v.object({
  ranking: v.union(marketplaceRankingSummaryValidator, v.null()),
  placements: v.record(v.string(), v.number()),
})

export const marketplaceRankingPublishAvailabilityValidator = v.object({
  canPublish: v.boolean(),
  reason: v.union(rankingPublishBlockReasonValidator, v.null()),
  message: v.union(v.string(), v.null()),
  activeItemCount: v.number(),
  unrankedItemCount: v.number(),
  sourceTemplateTitle: v.union(v.string(), v.null()),
  sourceTemplateCriteria: templateCriteriaValidator,
  userPublishedCriterionExternalIds: v.array(v.string()),
  preferredCriterionExternalId: v.union(v.string(), v.null()),
})

export const marketplaceRankingPublishResultValidator = v.object({
  slug: v.string(),
})

export const marketplaceRankingRemixResultValidator = v.object({
  boardExternalId: v.string(),
})

export const marketplaceTemplateRankingAggregateTemplateRefValidator = v.object(
  {
    slug: v.string(),
    title: v.string(),
    category: templateCategoryValidator,
    itemCount: v.number(),
  }
)

export const marketplaceTemplateRankingAggregateBucketValidator = v.object({
  index: v.number(),
  label: v.string(),
  colorSpec: v.union(tierColorSpecValidator, v.null()),
})

const marketplaceTemplateRankingAggregateHighlightValidator = v.object({
  templateItemExternalId: v.string(),
  label: v.union(v.string(), v.null()),
})

export const marketplaceTemplateRankingAggregateValidator = v.object({
  template: marketplaceTemplateRankingAggregateTemplateRefValidator,
  criterion: templateCriterionValidator,
  state: templateRankingAggregateStateValidator,
  activeGeneration: v.union(v.number(), v.null()),
  bucketCount: v.number(),
  rankingCount: v.number(),
  itemCount: v.number(),
  computedAt: v.union(v.number(), v.null()),
  staleAt: v.union(v.number(), v.null()),
  buckets: v.array(marketplaceTemplateRankingAggregateBucketValidator),
  bucketSpread: v.array(v.number()),
  mostAgreed: v.union(
    marketplaceTemplateRankingAggregateHighlightValidator,
    v.null()
  ),
  mostDivisive: v.union(
    marketplaceTemplateRankingAggregateHighlightValidator,
    v.null()
  ),
})

export const marketplaceTemplateRankingAggregateDistributionCellValidator =
  v.object({
    bucketIndex: v.number(),
    count: v.number(),
    share: v.number(),
  })

export const marketplaceTemplateRankingAggregateItemValidator = v.object({
  externalId: v.string(),
  templateItemExternalId: v.string(),
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  altText: v.union(v.string(), v.null()),
  media: v.union(templateMediaRefValidator, v.null()),
  order: v.number(),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
  sampleCount: v.number(),
  averageBucket: v.union(v.number(), v.null()),
  topBucketIndex: v.union(v.number(), v.null()),
  topBucketShare: v.number(),
  consensusScore: v.number(),
  controversyScore: v.number(),
  controversyPercentile: v.number(),
  agreementPercentile: v.number(),
  isTopBucket: v.boolean(),
  isBottomBucket: v.boolean(),
  isControversial: v.boolean(),
  distribution: v.array(
    marketplaceTemplateRankingAggregateDistributionCellValidator
  ),
})

export const marketplaceTemplateRankingAggregateItemsResultValidator =
  paginationResultValidator(marketplaceTemplateRankingAggregateItemValidator)

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

export type _MarketplaceTemplateCriterionCovers = _Assert<
  MarketplaceTemplateCriterion extends Infer<typeof templateCriterionValidator>
    ? true
    : false
>
export type _MarketplaceTemplateCriterionNoExtra = _Assert<
  Infer<typeof templateCriterionValidator> extends MarketplaceTemplateCriterion
    ? true
    : false
>

export type _MarketplaceTemplateCriterionSnapshotCovers = _Assert<
  MarketplaceTemplateCriterionSnapshot extends Infer<
    typeof templateCriterionSnapshotValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateCriterionSnapshotNoExtra = _Assert<
  Infer<
    typeof templateCriterionSnapshotValidator
  > extends MarketplaceTemplateCriterionSnapshot
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

export type _MarketplaceTemplateGalleryRailResultCovers = _Assert<
  MarketplaceTemplateGalleryRailResult extends Infer<
    typeof marketplaceTemplateGalleryRailResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateGalleryRailResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateGalleryRailResultValidator
  > extends MarketplaceTemplateGalleryRailResult
    ? true
    : false
>

export type _MarketplaceTemplateGalleryResultsResultCovers = _Assert<
  MarketplaceTemplateGalleryResultsResult extends Infer<
    typeof marketplaceTemplateGalleryResultsResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateGalleryResultsResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateGalleryResultsResultValidator
  > extends MarketplaceTemplateGalleryResultsResult
    ? true
    : false
>

export type _MarketplaceTemplateManagementItemCovers = _Assert<
  MarketplaceTemplateManagementItem extends Infer<
    typeof marketplaceTemplateManagementItemValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateManagementItemNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateManagementItemValidator
  > extends MarketplaceTemplateManagementItem
    ? true
    : false
>

export type _MarketplaceTemplateManagementListResultCovers = _Assert<
  MarketplaceTemplateManagementListResult extends Infer<
    typeof marketplaceTemplateManagementListResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateManagementListResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateManagementListResultValidator
  > extends MarketplaceTemplateManagementListResult
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

export type _MarketplaceTemplateBookmarkStateCovers = _Assert<
  MarketplaceTemplateBookmarkState extends Infer<
    typeof marketplaceTemplateBookmarkStateValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateBookmarkStateNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateBookmarkStateValidator
  > extends MarketplaceTemplateBookmarkState
    ? true
    : false
>

export type _MarketplaceTemplateBookmarkListItemCovers = _Assert<
  MarketplaceTemplateBookmarkListItem extends Infer<
    typeof marketplaceTemplateBookmarkListItemValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateBookmarkListItemNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateBookmarkListItemValidator
  > extends MarketplaceTemplateBookmarkListItem
    ? true
    : false
>

export type _MarketplaceTemplateBookmarkListResultCovers = _Assert<
  MarketplaceTemplateBookmarkListResult extends Infer<
    typeof marketplaceTemplateBookmarkListResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateBookmarkListResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateBookmarkListResultValidator
  > extends MarketplaceTemplateBookmarkListResult
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

export type _MarketplaceRankingSummaryCovers = _Assert<
  MarketplaceRankingSummary extends Infer<
    typeof marketplaceRankingSummaryValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingSummaryNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingSummaryValidator
  > extends MarketplaceRankingSummary
    ? true
    : false
>

export type _MarketplaceRankingTierCovers = _Assert<
  MarketplaceRankingTier extends Infer<typeof marketplaceRankingTierValidator>
    ? true
    : false
>
export type _MarketplaceRankingTierNoExtra = _Assert<
  Infer<typeof marketplaceRankingTierValidator> extends MarketplaceRankingTier
    ? true
    : false
>

export type _MarketplaceRankingItemCovers = _Assert<
  MarketplaceRankingItem extends Infer<typeof marketplaceRankingItemValidator>
    ? true
    : false
>
export type _MarketplaceRankingItemNoExtra = _Assert<
  Infer<typeof marketplaceRankingItemValidator> extends MarketplaceRankingItem
    ? true
    : false
>

export type _MarketplaceRankingDetailCovers = _Assert<
  MarketplaceRankingDetail extends Infer<
    typeof marketplaceRankingDetailValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingDetailNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingDetailValidator
  > extends MarketplaceRankingDetail
    ? true
    : false
>

export type _MarketplaceRankingListResultCovers = _Assert<
  MarketplaceRankingListResult extends Infer<
    typeof marketplaceRankingListResultValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingListResultNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingListResultValidator
  > extends MarketplaceRankingListResult
    ? true
    : false
>

export type _MarketplaceRankingPaginatedResultCovers = _Assert<
  MarketplaceRankingPaginatedResult extends Infer<
    typeof marketplaceRankingPaginatedResultValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingPaginatedResultNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingPaginatedResultValidator
  > extends MarketplaceRankingPaginatedResult
    ? true
    : false
>

export type _MarketplaceMyRankingForTemplateResultCovers = _Assert<
  MarketplaceMyRankingForTemplateResult extends Infer<
    typeof marketplaceMyRankingForTemplateResultValidator
  >
    ? true
    : false
>
export type _MarketplaceMyRankingForTemplateResultNoExtra = _Assert<
  Infer<
    typeof marketplaceMyRankingForTemplateResultValidator
  > extends MarketplaceMyRankingForTemplateResult
    ? true
    : false
>

export type _MarketplaceRankingPublishAvailabilityCovers = _Assert<
  MarketplaceRankingPublishAvailability extends Infer<
    typeof marketplaceRankingPublishAvailabilityValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingPublishAvailabilityNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingPublishAvailabilityValidator
  > extends MarketplaceRankingPublishAvailability
    ? true
    : false
>

export type _MarketplaceRankingPublishResultCovers = _Assert<
  MarketplaceRankingPublishResult extends Infer<
    typeof marketplaceRankingPublishResultValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingPublishResultNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingPublishResultValidator
  > extends MarketplaceRankingPublishResult
    ? true
    : false
>

export type _MarketplaceRankingRemixResultCovers = _Assert<
  MarketplaceRankingRemixResult extends Infer<
    typeof marketplaceRankingRemixResultValidator
  >
    ? true
    : false
>
export type _MarketplaceRankingRemixResultNoExtra = _Assert<
  Infer<
    typeof marketplaceRankingRemixResultValidator
  > extends MarketplaceRankingRemixResult
    ? true
    : false
>

export type _MarketplaceTemplateRankingAggregateTemplateRefCovers = _Assert<
  MarketplaceTemplateRankingAggregateTemplateRef extends Infer<
    typeof marketplaceTemplateRankingAggregateTemplateRefValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateRankingAggregateTemplateRefNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateRankingAggregateTemplateRefValidator
  > extends MarketplaceTemplateRankingAggregateTemplateRef
    ? true
    : false
>

export type _MarketplaceTemplateRankingAggregateBucketCovers = _Assert<
  MarketplaceTemplateRankingAggregateBucket extends Infer<
    typeof marketplaceTemplateRankingAggregateBucketValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateRankingAggregateBucketNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateRankingAggregateBucketValidator
  > extends MarketplaceTemplateRankingAggregateBucket
    ? true
    : false
>

export type _MarketplaceTemplateRankingAggregateCovers = _Assert<
  MarketplaceTemplateRankingAggregate extends Infer<
    typeof marketplaceTemplateRankingAggregateValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateRankingAggregateNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateRankingAggregateValidator
  > extends MarketplaceTemplateRankingAggregate
    ? true
    : false
>

export type _MarketplaceTemplateRankingAggregateDistributionCellCovers =
  _Assert<
    MarketplaceTemplateRankingAggregateDistributionCell extends Infer<
      typeof marketplaceTemplateRankingAggregateDistributionCellValidator
    >
      ? true
      : false
  >
export type _MarketplaceTemplateRankingAggregateDistributionCellNoExtra =
  _Assert<
    Infer<
      typeof marketplaceTemplateRankingAggregateDistributionCellValidator
    > extends MarketplaceTemplateRankingAggregateDistributionCell
      ? true
      : false
  >

export type _MarketplaceTemplateRankingAggregateItemCovers = _Assert<
  MarketplaceTemplateRankingAggregateItem extends Infer<
    typeof marketplaceTemplateRankingAggregateItemValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateRankingAggregateItemNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateRankingAggregateItemValidator
  > extends MarketplaceTemplateRankingAggregateItem
    ? true
    : false
>

export type _MarketplaceTemplateRankingAggregateItemsResultCovers = _Assert<
  MarketplaceTemplateRankingAggregateItemsResult extends Infer<
    typeof marketplaceTemplateRankingAggregateItemsResultValidator
  >
    ? true
    : false
>
export type _MarketplaceTemplateRankingAggregateItemsResultNoExtra = _Assert<
  Infer<
    typeof marketplaceTemplateRankingAggregateItemsResultValidator
  > extends MarketplaceTemplateRankingAggregateItemsResult
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
