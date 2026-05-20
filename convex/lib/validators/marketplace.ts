// convex/lib/validators/marketplace.ts
// marketplace template, ranking, & aggregate validators

import type { Infer } from 'convex/values'
import { v } from 'convex/values'
import { paginationResultValidator } from 'convex/server'
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from '@tierlistbuilder/contracts/marketplace/category'
import {
  TEMPLATE_CARD_ACCESS_STATES,
  TEMPLATE_GALLERY_RAILS,
  TEMPLATE_JOB_STATUSES,
  TEMPLATE_LIST_SORTS,
  TEMPLATE_PUBLICATION_STATES,
  TEMPLATE_SIZE_CLASSES,
  TEMPLATE_VISIBILITIES,
  type CoverFrame,
  type MarketplaceTemplateBookmarkListItem,
  type MarketplaceTemplateBookmarkListResult,
  type MarketplaceTemplateBookmarkState,
  type MarketplaceTemplateCloneJobProgress,
  type MarketplaceTemplateCount,
  type MarketplaceTemplateDetail,
  type MarketplaceTemplateDraft,
  type MarketplaceTemplateDraftListResult,
  type MarketplaceTemplateDraftTemplate,
  type MarketplaceTemplateGalleryCard,
  type MarketplaceTemplateGalleryRailResult,
  type MarketplaceTemplateGalleryResult,
  type MarketplaceTemplateGalleryResultsResult,
  type MarketplaceTemplateItem,
  type MarketplaceTemplateItemsResult,
  type MarketplaceTemplateListResult,
  type MarketplaceTemplateManagementItem,
  type MarketplaceTemplateManagementListResult,
  type MarketplaceTemplatePublishJobProgress,
  type MarketplaceTemplatePublishResult,
  type MarketplaceTemplateSummary,
  type MarketplaceTemplateUseResult,
  type TemplateCoverFraming,
  type TemplateCoverItem,
  type TemplateGalleryRail,
  type TemplateJobStatus,
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
  type MarketplaceRankingDetail,
  type MarketplaceRankingItem,
  type MarketplaceRankingListResult,
  type MarketplaceRankingPaginatedResult,
  type MarketplaceRankingPublishAvailability,
  type MarketplaceRankingPublishResult,
  type MarketplaceRankingRemixResult,
  type MarketplaceRankingSummary,
  type MarketplaceRankingTier,
  type RankingListSort,
  type RankingPublicationState,
  type RankingPublishBlockReason,
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
  type _Assert,
  type _Exact,
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  imageFitNullableValidator,
  itemTransformValidator,
  literalUnion,
  mediaPlateNullableValidator,
  tierColorSpecValidator,
  tierPresetTiersValidator,
} from './common'
import { mediaVariantSummaryValidator } from './platform'

export const templateCategoryValidator = literalUnion(TEMPLATE_CATEGORIES)
export const templateListSortValidator = literalUnion(TEMPLATE_LIST_SORTS)
export const templateVisibilityValidator = literalUnion(TEMPLATE_VISIBILITIES)
export const templateSizeClassValidator = literalUnion(TEMPLATE_SIZE_CLASSES)
export const templatePublicationStateValidator = literalUnion(
  TEMPLATE_PUBLICATION_STATES
)
export const templateJobStatusValidator = literalUnion(TEMPLATE_JOB_STATUSES)
export const templateGalleryRailValidator = literalUnion(TEMPLATE_GALLERY_RAILS)
export const templateCriterionStatusValidator = literalUnion(
  TEMPLATE_CRITERION_STATUSES
)
export const templateCardAccessStateValidator = literalUnion(
  TEMPLATE_CARD_ACCESS_STATES
)
export const rankingListSortValidator = literalUnion(RANKING_LIST_SORTS)
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

export const coverFrameValidator = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
})

export const templateCoverFramingValidator = v.object({
  browseHero: v.union(coverFrameValidator, v.null()),
  detailHero: v.union(coverFrameValidator, v.null()),
  card: v.union(coverFrameValidator, v.null()),
})

export const templateCardCoverItemValidator = v.object({
  media: templateCardMediaValidator,
  label: v.union(v.string(), v.null()),
  backgroundColor: v.union(v.string(), v.null()),
  mediaPlate: mediaPlateNullableValidator,
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: imageFitNullableValidator,
  transform: v.union(itemTransformValidator, v.null()),
  imagePadding: v.union(v.number(), v.null()),
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
  mediaPlate: mediaPlateNullableValidator,
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: imageFitNullableValidator,
  transform: v.union(itemTransformValidator, v.null()),
  imagePadding: v.union(v.number(), v.null()),
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
  defaultItemImageFit: imageFitNullableValidator,
  defaultItemImagePadding: v.union(v.number(), v.null()),
  autoPlate: v.union(boardAutoPlateSettingsValidator, v.null()),
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
  mediaPlate: mediaPlateNullableValidator,
  altText: v.union(v.string(), v.null()),
  media: v.union(templateMediaRefValidator, v.null()),
  order: v.number(),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: imageFitNullableValidator,
  transform: v.union(itemTransformValidator, v.null()),
  imagePadding: v.union(v.number(), v.null()),
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
  mediaPlate: mediaPlateNullableValidator,
  altText: v.union(v.string(), v.null()),
  media: v.union(templateMediaRefValidator, v.null()),
  order: v.number(),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: imageFitNullableValidator,
  transform: v.union(itemTransformValidator, v.null()),
  imagePadding: v.union(v.number(), v.null()),
})

export const marketplaceRankingDetailValidator = v.object({
  ...marketplaceRankingSummaryFields,
  autoPlate: v.union(boardAutoPlateSettingsValidator, v.null()),
  defaultItemImagePadding: v.union(v.number(), v.null()),
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
  mediaPlate: mediaPlateNullableValidator,
  altText: v.union(v.string(), v.null()),
  media: v.union(templateMediaRefValidator, v.null()),
  order: v.number(),
  aspectRatio: v.union(v.number(), v.null()),
  imageFit: imageFitNullableValidator,
  transform: v.union(itemTransformValidator, v.null()),
  imagePadding: v.union(v.number(), v.null()),
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
export type _CoverFrameExact = _Assert<
  _Exact<CoverFrame, Infer<typeof coverFrameValidator>>
>
export type _TemplateCoverFramingExact = _Assert<
  _Exact<TemplateCoverFraming, Infer<typeof templateCoverFramingValidator>>
>
export type _TemplateMediaRefExact = _Assert<
  _Exact<TemplateMediaRef, Infer<typeof templateMediaRefValidator>>
>
export type _TemplateCoverItemExact = _Assert<
  _Exact<TemplateCoverItem, Infer<typeof templateCoverItemValidator>>
>
export type _MarketplaceTemplateCriterionExact = _Assert<
  _Exact<MarketplaceTemplateCriterion, Infer<typeof templateCriterionValidator>>
>
export type _MarketplaceTemplateCriterionSnapshotExact = _Assert<
  _Exact<
    MarketplaceTemplateCriterionSnapshot,
    Infer<typeof templateCriterionSnapshotValidator>
  >
>
export type _MarketplaceTemplateSummaryExact = _Assert<
  _Exact<
    MarketplaceTemplateSummary,
    Infer<typeof marketplaceTemplateSummaryValidator>
  >
>
export type _MarketplaceTemplateGalleryCardExact = _Assert<
  _Exact<
    MarketplaceTemplateGalleryCard,
    Infer<typeof marketplaceTemplateGalleryCardValidator>
  >
>
export type _MarketplaceTemplateCountExact = _Assert<
  _Exact<
    MarketplaceTemplateCount,
    Infer<typeof marketplaceTemplateCountValidator>
  >
>
export type _MarketplaceTemplateGalleryResultExact = _Assert<
  _Exact<
    MarketplaceTemplateGalleryResult,
    Infer<typeof marketplaceTemplateGalleryResultValidator>
  >
>
export type _MarketplaceTemplateGalleryRailResultExact = _Assert<
  _Exact<
    MarketplaceTemplateGalleryRailResult,
    Infer<typeof marketplaceTemplateGalleryRailResultValidator>
  >
>
export type _MarketplaceTemplateGalleryResultsResultExact = _Assert<
  _Exact<
    MarketplaceTemplateGalleryResultsResult,
    Infer<typeof marketplaceTemplateGalleryResultsResultValidator>
  >
>
export type _MarketplaceTemplateManagementItemExact = _Assert<
  _Exact<
    MarketplaceTemplateManagementItem,
    Infer<typeof marketplaceTemplateManagementItemValidator>
  >
>
export type _MarketplaceTemplateManagementListResultExact = _Assert<
  _Exact<
    MarketplaceTemplateManagementListResult,
    Infer<typeof marketplaceTemplateManagementListResultValidator>
  >
>
export type _MarketplaceTemplateItemExact = _Assert<
  _Exact<
    MarketplaceTemplateItem,
    Infer<typeof marketplaceTemplateItemValidator>
  >
>
export type _MarketplaceTemplateDetailExact = _Assert<
  _Exact<
    MarketplaceTemplateDetail,
    Infer<typeof marketplaceTemplateDetailValidator>
  >
>
export type _MarketplaceTemplateItemsResultExact = _Assert<
  _Exact<
    MarketplaceTemplateItemsResult,
    Infer<typeof marketplaceTemplateItemsResultValidator>
  >
>
export type _MarketplaceTemplateBookmarkStateExact = _Assert<
  _Exact<
    MarketplaceTemplateBookmarkState,
    Infer<typeof marketplaceTemplateBookmarkStateValidator>
  >
>
export type _MarketplaceTemplateBookmarkListItemExact = _Assert<
  _Exact<
    MarketplaceTemplateBookmarkListItem,
    Infer<typeof marketplaceTemplateBookmarkListItemValidator>
  >
>
export type _MarketplaceTemplateBookmarkListResultExact = _Assert<
  _Exact<
    MarketplaceTemplateBookmarkListResult,
    Infer<typeof marketplaceTemplateBookmarkListResultValidator>
  >
>
export type _MarketplaceTemplateListResultExact = _Assert<
  _Exact<
    MarketplaceTemplateListResult,
    Infer<typeof marketplaceTemplateListResultValidator>
  >
>
export type _MarketplaceTemplateDraftTemplateExact = _Assert<
  _Exact<
    MarketplaceTemplateDraftTemplate,
    Infer<typeof marketplaceTemplateDraftTemplateValidator>
  >
>
export type _MarketplaceTemplateDraftExact = _Assert<
  _Exact<
    MarketplaceTemplateDraft,
    Infer<typeof marketplaceTemplateDraftValidator>
  >
>
export type _MarketplaceTemplateDraftListResultExact = _Assert<
  _Exact<
    MarketplaceTemplateDraftListResult,
    Infer<typeof marketplaceTemplateDraftListResultValidator>
  >
>
export type _MarketplaceTemplatePublishJobProgressExact = _Assert<
  _Exact<
    MarketplaceTemplatePublishJobProgress,
    Infer<typeof marketplaceTemplatePublishJobProgressValidator>
  >
>
export type _MarketplaceTemplateCloneJobProgressExact = _Assert<
  _Exact<
    MarketplaceTemplateCloneJobProgress,
    Infer<typeof marketplaceTemplateCloneJobProgressValidator>
  >
>
export type _MarketplaceTemplatePublishResultExact = _Assert<
  _Exact<
    MarketplaceTemplatePublishResult,
    Infer<typeof marketplaceTemplatePublishResultValidator>
  >
>
export type _MarketplaceTemplateUseResultExact = _Assert<
  _Exact<
    MarketplaceTemplateUseResult,
    Infer<typeof marketplaceTemplateUseResultValidator>
  >
>
export type _MarketplaceRankingSummaryExact = _Assert<
  _Exact<
    MarketplaceRankingSummary,
    Infer<typeof marketplaceRankingSummaryValidator>
  >
>
export type _MarketplaceRankingTierExact = _Assert<
  _Exact<MarketplaceRankingTier, Infer<typeof marketplaceRankingTierValidator>>
>
export type _MarketplaceRankingItemExact = _Assert<
  _Exact<MarketplaceRankingItem, Infer<typeof marketplaceRankingItemValidator>>
>
export type _MarketplaceRankingDetailExact = _Assert<
  _Exact<
    MarketplaceRankingDetail,
    Infer<typeof marketplaceRankingDetailValidator>
  >
>
export type _MarketplaceRankingListResultExact = _Assert<
  _Exact<
    MarketplaceRankingListResult,
    Infer<typeof marketplaceRankingListResultValidator>
  >
>
export type _MarketplaceRankingPaginatedResultExact = _Assert<
  _Exact<
    MarketplaceRankingPaginatedResult,
    Infer<typeof marketplaceRankingPaginatedResultValidator>
  >
>
export type _MarketplaceMyRankingForTemplateResultExact = _Assert<
  _Exact<
    MarketplaceMyRankingForTemplateResult,
    Infer<typeof marketplaceMyRankingForTemplateResultValidator>
  >
>
export type _MarketplaceRankingPublishAvailabilityExact = _Assert<
  _Exact<
    MarketplaceRankingPublishAvailability,
    Infer<typeof marketplaceRankingPublishAvailabilityValidator>
  >
>
export type _MarketplaceRankingPublishResultExact = _Assert<
  _Exact<
    MarketplaceRankingPublishResult,
    Infer<typeof marketplaceRankingPublishResultValidator>
  >
>
export type _MarketplaceRankingRemixResultExact = _Assert<
  _Exact<
    MarketplaceRankingRemixResult,
    Infer<typeof marketplaceRankingRemixResultValidator>
  >
>
export type _MarketplaceTemplateRankingAggregateTemplateRefExact = _Assert<
  _Exact<
    MarketplaceTemplateRankingAggregateTemplateRef,
    Infer<typeof marketplaceTemplateRankingAggregateTemplateRefValidator>
  >
>
export type _MarketplaceTemplateRankingAggregateBucketExact = _Assert<
  _Exact<
    MarketplaceTemplateRankingAggregateBucket,
    Infer<typeof marketplaceTemplateRankingAggregateBucketValidator>
  >
>
export type _MarketplaceTemplateRankingAggregateExact = _Assert<
  _Exact<
    MarketplaceTemplateRankingAggregate,
    Infer<typeof marketplaceTemplateRankingAggregateValidator>
  >
>
export type _MarketplaceTemplateRankingAggregateDistributionCellExact = _Assert<
  _Exact<
    MarketplaceTemplateRankingAggregateDistributionCell,
    Infer<typeof marketplaceTemplateRankingAggregateDistributionCellValidator>
  >
>
export type _MarketplaceTemplateRankingAggregateItemExact = _Assert<
  _Exact<
    MarketplaceTemplateRankingAggregateItem,
    Infer<typeof marketplaceTemplateRankingAggregateItemValidator>
  >
>
export type _MarketplaceTemplateRankingAggregateItemsResultExact = _Assert<
  _Exact<
    MarketplaceTemplateRankingAggregateItemsResult,
    Infer<typeof marketplaceTemplateRankingAggregateItemsResultValidator>
  >
>
