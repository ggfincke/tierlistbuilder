// convex/schema/marketplace.ts
// marketplace template, ranking, aggregate, & bookmark tables

import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  templateCardCoverItemValidator,
  templateCardMediaValidator,
  templateCategoryValidator,
  templateCoverFramingValidator,
  templateCriteriaValidator,
  templateJobStatusValidator,
  templateSizeClassValidator,
  templateRankingAggregateJobPhaseValidator,
  templateRankingAggregateJobStatusValidator,
  templateRankingAggregateStateValidator,
  templatePublicationStateValidator,
  rankingFeaturedBadgeValidator,
  rankingPublicationStateValidator,
  rankingVisibilityValidator,
  templateVisibilityValidator,
} from '../lib/validators/marketplace'
import {
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  imageFitNullableValidator,
  itemTransformValidator,
  mediaPlateNullableValidator,
  styleItemRenderFields,
  tierColorSpecValidator,
  tierPresetTiersValidator,
} from '../lib/validators/common'
import {
  seedRankingReleaseStatusValidator,
  seedTemplateReleaseStatusValidator,
} from '../lib/validators/seedPipeline'

export const marketplaceTables = {
  // public marketplace template - publishable item set w/ optional suggested tiers
  templates: defineTable({
    slug: v.string(),
    authorId: v.id('users'),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    visibility: templateVisibilityValidator,
    coverMediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    // per-surface framings of the cover image. null on rows w/o a cover or
    // when the author hasn't framed yet - runtime falls back to full-image
    // object-cover into the surface container
    coverFraming: v.union(templateCoverFramingValidator, v.null()),
    coverItems: v.array(
      v.object({
        mediaAssetId: v.id('mediaAssets'),
        label: v.union(v.string(), v.null()),
        backgroundColor: v.union(v.string(), v.null()),
        mediaPlate: v.optional(mediaPlateNullableValidator),
        aspectRatio: v.union(v.number(), v.null()),
        imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
        transform: v.union(itemTransformValidator, v.null()),
        imagePadding: v.union(v.number(), v.null()),
      })
    ),
    suggestedTiers: tierPresetTiersValidator,
    criteria: templateCriteriaValidator,
    sourceBoardId: v.union(v.id('boards'), v.null()),
    sizeClass: templateSizeClassValidator,
    publicationState: templatePublicationStateValidator,
    isPubliclyListable: v.boolean(),
    itemCount: v.number(),
    featuredRank: v.union(v.number(), v.null()),
    creditLine: v.union(v.string(), v.null()),
    // slot aspect ratio (w/h) the template was designed against; null ->
    // forks fall back to the board default (1, square)
    itemAspectRatio: v.union(v.number(), v.null()),
    // 'auto' tracks content; 'manual' pins the ratio. seed action snaps to a
    // preset & writes 'manual' so forked boards land on the same canonical
    // ratio the per-item transforms were computed against
    itemAspectRatioMode: v.union(
      v.literal('auto'),
      v.literal('manual'),
      v.null()
    ),
    // board-wide fit when an item has no per-item override on the forked board
    defaultItemImageFit: v.union(
      v.literal('cover'),
      v.literal('contain'),
      v.null()
    ),
    defaultItemImagePadding: v.union(v.number(), v.null()),
    // pre-baked label rendering defaults - forked boards inherit these so the
    // publisher's caption styling shows up without each user toggling labels
    labels: v.union(boardLabelSettingsValidator, v.null()),
    // per-board logo backdrop pinned at publish; absent -> On+Auto default
    autoPlate: v.optional(boardAutoPlateSettingsValidator),
    // externalId of the default image style; null/absent -> single-skin
    // template. the default style's images live on templateItems
    defaultStyleId: v.optional(v.union(v.string(), v.null())),
    // seed identity fields let Python diff/upsert by stable external IDs
    // while user-published templates continue to omit them
    seedDatasetKey: v.optional(v.string()),
    seedExternalId: v.optional(v.string()),
    seedReleaseId: v.optional(v.string()),
    seedReleaseStatus: v.optional(seedTemplateReleaseStatusValidator),
    seedMetadataContentHash: v.optional(v.string()),
    seedItemsContentHash: v.optional(v.string()),
    seedStyleItemsContentHash: v.optional(v.union(v.string(), v.null())),
    seedCriteriaContentHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('bySlug', ['slug'])
    .index('byAuthorUpdatedAt', ['authorId', 'updatedAt'])
    .index('byCoverMedia', ['coverMediaAssetId'])
    .index('bySeedDatasetReleaseAndExternalId', [
      'seedDatasetKey',
      'seedReleaseId',
      'seedExternalId',
    ]),
  // compact public/owner card read model for marketplace list screens.
  // media fields store refs only; queries resolve signed URLs per request
  templateCards: defineTable({
    templateId: v.id('templates'),
    slug: v.string(),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    visibility: templateVisibilityValidator,
    publicationState: templatePublicationStateValidator,
    isPubliclyListable: v.boolean(),
    itemCount: v.number(),
    sizeClass: templateSizeClassValidator,
    authorId: v.id('users'),
    authorExternalId: v.string(),
    authorDisplayName: v.string(),
    authorImageUrl: v.union(v.string(), v.null()),
    authorAvatarStorageId: v.union(v.id('_storage'), v.null()),
    coverMedia: v.union(templateCardMediaValidator, v.null()),
    // mirror of templates.coverFraming so gallery cards can apply per-surface
    // crops without a parent-table read
    coverFraming: v.union(templateCoverFramingValidator, v.null()),
    coverItems: v.array(templateCardCoverItemValidator),
    // mirror of templates.itemAspectRatio so gallery cards can frame cover
    // tiles identically to the detail item grid w/o a parent-table read
    itemAspectRatio: v.union(v.number(), v.null()),
    // mirror of templates.defaultItemImageFit; null falls back to 'cover'
    defaultItemImageFit: v.union(
      v.literal('cover'),
      v.literal('contain'),
      v.null()
    ),
    defaultItemImagePadding: v.union(v.number(), v.null()),
    // mirror of templates.autoPlate; absent -> On+Auto default
    autoPlate: v.optional(boardAutoPlateSettingsValidator),
    featuredRank: v.union(v.number(), v.null()),
    forkCount: v.number(),
    viewCount: v.number(),
    // denormalized total of public published rankings across every criterion.
    // initialized to 0 on insert; rollupTemplateRankingCount patches it after
    // each aggregate job finish
    rankingCount: v.number(),
    weeklyForkCount: v.number(),
    weeklyViewCount: v.number(),
    trendingScore: v.number(),
    trendingComputedAt: v.union(v.number(), v.null()),
    creditLine: v.union(v.string(), v.null()),
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byTemplateId', ['templateId'])
    .index('bySlug', ['slug'])
    .index('byAuthorUpdatedAt', ['authorId', 'updatedAt'])
    .index('byAuthorIsPubliclyListableUpdatedAt', [
      'authorId',
      'isPubliclyListable',
      'updatedAt',
    ])
    .index('byAuthorAvatarStorageId', ['authorAvatarStorageId'])
    .index('byIsPubliclyListableUpdatedAt', ['isPubliclyListable', 'updatedAt'])
    .index('byIsPubliclyListableForkCount', ['isPubliclyListable', 'forkCount'])
    .index('byIsPubliclyListableTrendingScore', [
      'isPubliclyListable',
      'trendingScore',
    ])
    .index('byIsPubliclyListableFeaturedRank', [
      'isPubliclyListable',
      'featuredRank',
    ])
    .index('byCategoryIsPubliclyListableUpdatedAt', [
      'category',
      'isPubliclyListable',
      'updatedAt',
    ])
    .index('byCategoryIsPubliclyListableForkCount', [
      'category',
      'isPubliclyListable',
      'forkCount',
    ])
    .index('byCategoryIsPubliclyListableTrendingScore', [
      'category',
      'isPubliclyListable',
      'trendingScore',
    ])
    .index('byCategoryIsPubliclyListableFeaturedRank', [
      'category',
      'isPubliclyListable',
      'featuredRank',
    ])
    .searchIndex('searchPublic', {
      searchField: 'searchText',
      filterFields: ['isPubliclyListable', 'category'],
    }),
  templateStats: defineTable({
    templateId: v.id('templates'),
    forkCount: v.number(),
    viewCount: v.number(),
    updatedAt: v.number(),
  }).index('byTemplateId', ['templateId']),
  templateMetricDays: defineTable({
    templateId: v.id('templates'),
    category: templateCategoryValidator,
    dayStartAt: v.number(),
    forkCount: v.number(),
    viewCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('byTemplateDay', ['templateId', 'dayStartAt']),
  marketplaceStats: defineTable({
    key: v.string(),
    publicTemplateCount: v.number(),
    // denormalized per-category breakdown of public template count. keys are
    // TemplateCategory values; categories w/ zero templates are absent so the
    // record stays compact across taxonomy churn
    publicTemplateCountByCategory: v.record(v.string(), v.number()),
    updatedAt: v.number(),
  }).index('byKey', ['key']),
  // helper table for tag filtering. one row per (template, tag); denormalized
  // listability mirrors the parent so public tag queries avoid a join
  templateTags: defineTable({
    templateId: v.id('templates'),
    tag: v.string(),
    category: templateCategoryValidator,
    isPubliclyListable: v.boolean(),
    updatedAt: v.number(),
  })
    .index('byTagIsPubliclyListableUpdatedAt', [
      'tag',
      'isPubliclyListable',
      'updatedAt',
    ])
    .index('byCategoryTagIsPubliclyListableUpdatedAt', [
      'category',
      'tag',
      'isPubliclyListable',
      'updatedAt',
    ])
    .index('byTemplate', ['templateId']),
  templatePublishJobs: defineTable({
    ownerId: v.id('users'),
    sourceBoardId: v.id('boards'),
    targetTemplateId: v.id('templates'),
    status: templateJobStatusValidator,
    itemCount: v.number(),
    processedItemCount: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    sourceBoardRevision: v.number(),
    errorCode: v.union(v.string(), v.null()),
    retryCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.union(v.number(), v.null()),
    completedAt: v.union(v.number(), v.null()),
    canceledAt: v.union(v.number(), v.null()),
  })
    .index('byOwnerUpdatedAt', ['ownerId', 'updatedAt'])
    .index('bySourceBoardStatus', ['sourceBoardId', 'status']),
  templateCloneJobs: defineTable({
    ownerId: v.id('users'),
    sourceTemplateId: v.id('templates'),
    targetBoardId: v.id('boards'),
    status: templateJobStatusValidator,
    itemCount: v.number(),
    processedItemCount: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    errorCode: v.union(v.string(), v.null()),
    retryCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.union(v.number(), v.null()),
    completedAt: v.union(v.number(), v.null()),
    canceledAt: v.union(v.number(), v.null()),
  })
    .index('byOwnerUpdatedAt', ['ownerId', 'updatedAt'])
    .index('byOwnerSourceTemplateStatus', [
      'ownerId',
      'sourceTemplateId',
      'status',
    ]),
  // immutable-ish template item rows. rankings clone these into boardItems
  // as unranked entries, preserving templateItemId for future aggregation
  templateItems: defineTable({
    templateId: v.id('templates'),
    externalId: v.string(),
    label: v.union(v.string(), v.null()),
    backgroundColor: v.union(v.string(), v.null()),
    mediaPlate: v.optional(mediaPlateNullableValidator),
    altText: v.union(v.string(), v.null()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    aspectRatio: v.union(v.number(), v.null()),
    imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
    transform: v.union(itemTransformValidator, v.null()),
    imagePadding: v.union(v.number(), v.null()),
  })
    .index('byTemplate', ['templateId', 'order'])
    .index('byTemplateAndExternalId', ['templateId', 'externalId'])
    .index('byMedia', ['mediaAssetId']),
  // per-template image style (skin). exactly one isDefault row per template;
  // the default style's images live on templateItems (not duplicated here)
  templateStyles: defineTable({
    templateId: v.id('templates'),
    externalId: v.string(),
    label: v.string(),
    order: v.number(),
    isDefault: v.boolean(),
    coverMediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    coverFraming: v.union(templateCoverFramingValidator, v.null()),
    // per-style render defaults a forked board inherits when this style is
    // active; mirror the template board-level defaults so a skin can pin framing
    itemAspectRatio: v.union(v.number(), v.null()),
    itemAspectRatioMode: v.union(
      v.literal('auto'),
      v.literal('manual'),
      v.null()
    ),
    defaultItemImageFit: imageFitNullableValidator,
    defaultItemImagePadding: v.union(v.number(), v.null()),
    labels: v.union(boardLabelSettingsValidator, v.null()),
    autoPlate: v.optional(boardAutoPlateSettingsValidator),
    seedDatasetKey: v.optional(v.string()),
    seedReleaseId: v.optional(v.string()),
    seedItemsContentHash: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byTemplate', ['templateId', 'order'])
    .index('byTemplateAndExternalId', ['templateId', 'externalId'])
    .index('byCoverMedia', ['coverMediaAssetId']),
  // per-(style, item) image override. only non-default styles get rows here;
  // mediaAssetId null marks an item absent in this style. joined to a board
  // item via templateItemId at fork/switch time
  templateItemStyleAssets: defineTable({
    templateId: v.id('templates'),
    templateItemId: v.id('templateItems'),
    styleExternalId: v.string(),
    itemExternalId: v.string(),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    ...styleItemRenderFields,
  })
    .index('byTemplateStyleAndItem', [
      'templateId',
      'styleExternalId',
      'itemExternalId',
    ])
    .index('byMedia', ['mediaAssetId']),
  publishedRankings: defineTable({
    slug: v.string(),
    ownerId: v.id('users'),
    // source* attribution stays flat (vs. boards.sourceTemplate's nested
    // object) - rankings always have a source, fields are set once at publish
    // & never patched independently, so no atomic-update concern to solve
    sourceTemplateId: v.id('templates'),
    sourceBoardId: v.union(v.id('boards'), v.null()),
    sourceTemplateSlug: v.string(),
    sourceTemplateTitle: v.string(),
    sourceTemplateCategory: templateCategoryValidator,
    sourceCriterionExternalId: v.string(),
    sourceCriterionNameSnapshot: v.string(),
    sourceCriterionPromptSnapshot: v.string(),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    visibility: rankingVisibilityValidator,
    publicationState: rankingPublicationStateValidator,
    isPubliclyListable: v.boolean(),
    supersededAt: v.union(v.number(), v.null()),
    supersededByRankingId: v.union(v.id('publishedRankings'), v.null()),
    itemCount: v.number(),
    tierCount: v.number(),
    remixCount: v.number(),
    viewCount: v.number(),
    topScore: v.number(),
    isFeatured: v.boolean(),
    featuredRank: v.union(v.number(), v.null()),
    featuredBadge: v.union(rankingFeaturedBadgeValidator, v.null()),
    seedDatasetKey: v.union(v.string(), v.null()),
    seedReleaseId: v.union(v.string(), v.null()),
    seedExternalId: v.union(v.string(), v.null()),
    seedKind: v.union(v.literal('sample'), v.literal('curated'), v.null()),
    seedTemplateExternalId: v.union(v.string(), v.null()),
    seedCriterionExternalId: v.union(v.string(), v.null()),
    seedAuthorKey: v.union(v.string(), v.null()),
    seedProfileKey: v.union(v.string(), v.null()),
    seedCuratedExternalId: v.union(v.string(), v.null()),
    seedReleaseStatus: v.union(seedRankingReleaseStatusValidator, v.null()),
    seedContentHash: v.optional(v.string()),
    // image style (skin) externalId the author published in; null/absent ->
    // source template default. snapshotted so the shared ranking renders in the
    // author's chosen skin
    activeStyleId: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('bySlug', ['slug'])
    .index('byOwnerUpdatedAt', ['ownerId', 'updatedAt'])
    .index('bySourceTemplateCriterionOwnerPublicationStateUpdatedAt', [
      'sourceTemplateId',
      'sourceCriterionExternalId',
      'ownerId',
      'publicationState',
      'updatedAt',
    ])
    .index('bySourceTemplateCriterionOwnerPublicCreatedAt', [
      'sourceTemplateId',
      'sourceCriterionExternalId',
      'ownerId',
      'isPubliclyListable',
      'createdAt',
    ])
    .index('bySourceTemplatePublicUpdatedAt', [
      'sourceTemplateId',
      'isPubliclyListable',
      'updatedAt',
    ])
    .index('bySourceTemplateCriterionPublicUpdatedAt', [
      'sourceTemplateId',
      'sourceCriterionExternalId',
      'isPubliclyListable',
      'updatedAt',
    ])
    .index('bySourceTemplatePublicTopScoreAndUpdatedAt', [
      'sourceTemplateId',
      'isPubliclyListable',
      'topScore',
      'updatedAt',
    ])
    .index('bySourceTemplateCriterionPublicTopScoreAndUpdatedAt', [
      'sourceTemplateId',
      'sourceCriterionExternalId',
      'isPubliclyListable',
      'topScore',
      'updatedAt',
    ])
    .index('bySourceTemplatePublicFeaturedRank', [
      'sourceTemplateId',
      'isPubliclyListable',
      'isFeatured',
      'featuredRank',
    ])
    .index('bySourceTemplateCriterionPublicFeaturedRank', [
      'sourceTemplateId',
      'sourceCriterionExternalId',
      'isPubliclyListable',
      'isFeatured',
      'featuredRank',
    ])
    .index('bySourceTemplateCriterionPublicCreatedAt', [
      'sourceTemplateId',
      'sourceCriterionExternalId',
      'isPubliclyListable',
      'createdAt',
    ])
    .index('bySeedDatasetReleaseAndExternalId', [
      'seedDatasetKey',
      'seedReleaseId',
      'seedExternalId',
    ])
    .index('bySeedDatasetReleaseStatus', [
      'seedDatasetKey',
      'seedReleaseId',
      'seedReleaseStatus',
    ])
    // status/release index for ranking activation to discover active rows
    // outside the target release. seedRuns-based discovery does not work
    // because template activation flips the seedRun status before rankings run
    .index('bySeedDatasetStatusReleaseId', [
      'seedDatasetKey',
      'seedReleaseStatus',
      'seedReleaseId',
    ]),
  publishedRankingTiers: defineTable({
    rankingId: v.id('publishedRankings'),
    externalId: v.string(),
    name: v.string(),
    description: v.union(v.string(), v.null()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.union(tierColorSpecValidator, v.null()),
    order: v.number(),
  }).index('byRanking', ['rankingId', 'order']),
  publishedRankingItems: defineTable({
    rankingId: v.id('publishedRankings'),
    templateItemId: v.id('templateItems'),
    templateItemExternalId: v.string(),
    externalId: v.string(),
    tierExternalId: v.union(v.string(), v.null()),
    label: v.union(v.string(), v.null()),
    backgroundColor: v.union(v.string(), v.null()),
    mediaPlate: v.optional(mediaPlateNullableValidator),
    altText: v.union(v.string(), v.null()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    aspectRatio: v.union(v.number(), v.null()),
    imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
    transform: v.union(itemTransformValidator, v.null()),
    imagePadding: v.union(v.number(), v.null()),
  })
    .index('byRanking', ['rankingId', 'order'])
    .index('byMedia', ['mediaAssetId']),
  templateRankingAggregates: defineTable({
    templateId: v.id('templates'),
    criterionExternalId: v.string(),
    state: templateRankingAggregateStateValidator,
    activeGeneration: v.union(v.number(), v.null()),
    bucketCount: v.number(),
    rankingCount: v.number(),
    itemCount: v.number(),
    computedAt: v.union(v.number(), v.null()),
    staleAt: v.union(v.number(), v.null()),
    bucketSpread: v.array(v.number()),
    mostAgreedItemExternalId: v.union(v.string(), v.null()),
    mostAgreedItemLabel: v.union(v.string(), v.null()),
    mostDivisiveItemExternalId: v.union(v.string(), v.null()),
    mostDivisiveItemLabel: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  })
    .index('byTemplateId', ['templateId'])
    .index('byTemplateIdAndCriterion', ['templateId', 'criterionExternalId'])
    .index('byStateAndUpdatedAt', ['state', 'updatedAt']),
  templateRankingAggregateItems: defineTable({
    templateId: v.id('templates'),
    criterionExternalId: v.string(),
    generation: v.number(),
    templateItemId: v.id('templateItems'),
    templateItemExternalId: v.string(),
    label: v.union(v.string(), v.null()),
    backgroundColor: v.union(v.string(), v.null()),
    mediaPlate: v.optional(mediaPlateNullableValidator),
    altText: v.union(v.string(), v.null()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    aspectRatio: v.union(v.number(), v.null()),
    imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
    transform: v.union(itemTransformValidator, v.null()),
    imagePadding: v.union(v.number(), v.null()),
    sampleCount: v.number(),
    bucketWeightSum: v.number(),
    bucketSquareSum: v.number(),
    averageBucket: v.union(v.number(), v.null()),
    topBucketIndex: v.union(v.number(), v.null()),
    topBucketShare: v.number(),
    consensusScore: v.number(),
    controversyScore: v.number(),
    controversyPercentile: v.number(),
    agreementPercentile: v.number(),
    averageTopSort: v.number(),
    averageBottomSort: v.number(),
    consensusSort: v.number(),
    controversySort: v.number(),
    isTopBucket: v.boolean(),
    isBottomBucket: v.boolean(),
    isControversial: v.boolean(),
    searchText: v.string(),
    distribution: v.array(
      v.object({
        bucketIndex: v.number(),
        count: v.number(),
      })
    ),
    computedAt: v.number(),
  })
    .index('byTemplateIdAndOrder', ['templateId', 'order'])
    .index('byTemplateIdAndCriterionAndOrder', [
      'templateId',
      'criterionExternalId',
      'order',
    ])
    .index('byTemplateIdAndCriterionAndGenerationAndOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'order',
    ])
    .index('byTemplateIdAndCriterionAndGenerationAndTemplateItemId', [
      'templateId',
      'criterionExternalId',
      'generation',
      'templateItemId',
    ])
    // band='all' sort indexes - let .paginate() walk the B-tree at storage
    // layer instead of fetching MAX_SYNC_ITEMS rows + JS-sorting per page.
    // band-filtered views still fall back to in-memory sort.
    .index('byTemplateIdAndCriterionAndGenerationAndAvgTopSortAndOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'averageTopSort',
      'order',
    ])
    .index('byTemplateIdAndCriterionAndGenerationAndAvgBottomSortAndOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'averageBottomSort',
      'order',
    ])
    .index('byTemplateIdAndCriterionAndGenerationAndConsensusSortAndOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'consensusSort',
      'order',
    ])
    .index('byTemplateIdAndCriterionAndGenerationAndControversySortAndOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'controversySort',
      'order',
    ])
    .index('byTemplateCriterionGenerationTopOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'isTopBucket',
      'order',
    ])
    .index('byTemplateCriterionGenerationBottomOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'isBottomBucket',
      'order',
    ])
    .index('byTemplateCriterionGenerationControversialOrder', [
      'templateId',
      'criterionExternalId',
      'generation',
      'isControversial',
      'order',
    ])
    .searchIndex('searchByTemplateCriterionGeneration', {
      searchField: 'searchText',
      filterFields: [
        'templateId',
        'criterionExternalId',
        'generation',
        'isTopBucket',
        'isBottomBucket',
        'isControversial',
      ],
    }),
  templateRankingAggregateJobs: defineTable({
    templateId: v.id('templates'),
    criterionExternalId: v.string(),
    status: templateRankingAggregateJobStatusValidator,
    admittedAt: v.optional(v.union(v.number(), v.null())),
    phase: templateRankingAggregateJobPhaseValidator,
    generation: v.number(),
    bucketCount: v.number(),
    targetBucketLabels: v.array(v.string()),
    itemCount: v.number(),
    rankingCount: v.number(),
    publicRankingCount: v.number(),
    templateCursor: v.union(v.string(), v.null()),
    rankingCursor: v.union(v.string(), v.null()),
    rankingScanDone: v.boolean(),
    activeRankingId: v.union(v.id('publishedRankings'), v.null()),
    activeRankingTierBucketMap: v.union(
      v.array(
        v.object({
          tierExternalId: v.string(),
          bucketIndex: v.number(),
        })
      ),
      v.null()
    ),
    activeRankingItemCursor: v.union(v.string(), v.null()),
    relativeMetricPatches: v.optional(
      v.array(
        v.object({
          aggregateItemId: v.id('templateRankingAggregateItems'),
          controversyPercentile: v.number(),
          agreementPercentile: v.number(),
          isControversial: v.boolean(),
        })
      )
    ),
    relativeMetricCursor: v.optional(v.number()),
    bucketSpread: v.array(v.number()),
    restartRequestedAt: v.union(v.number(), v.null()),
    retryCount: v.number(),
    lastError: v.union(v.string(), v.null()),
    failedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byTemplateId', ['templateId'])
    .index('byTemplateIdAndCriterion', ['templateId', 'criterionExternalId'])
    .index('byTemplateIdAndCriterionAndStatus', [
      'templateId',
      'criterionExternalId',
      'status',
    ])
    .index('byStatusAndUpdatedAt', ['status', 'updatedAt']),
  templateRankingAggregateAdmission: defineTable({
    key: v.string(),
    scheduledAt: v.number(),
    updatedAt: v.number(),
  }).index('byKey', ['key']),
  userTemplateBookmarks: defineTable({
    userId: v.id('users'),
    templateId: v.id('templates'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byUserTemplate', ['userId', 'templateId'])
    .index('byUserCreatedAt', ['userId', 'createdAt'])
    .index('byTemplateUser', ['templateId', 'userId']),
}
