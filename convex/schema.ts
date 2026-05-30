// convex/schema.ts
// * convex database schema — tables for workspace, platform, & community domains

import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  appPreferencesValidator,
  mediaVariantKindValidator,
  mediaVariantSummaryValidator,
  userPlanValidator,
} from './lib/validators/platform'
import {
  boardCloudStateValidator,
  boardLibrarySummaryValidator,
  boardMaterializationStateValidator,
  boardPausedReasonValidator,
} from './lib/validators/workspace'
import {
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  itemLabelOptionsValidator,
  itemTransformValidator,
  mediaPlateNullableValidator,
  mediaPlateValidator,
  paletteIdValidator,
  textStyleIdValidator,
  tierColorSpecValidator,
  tierPresetTiersValidator,
} from './lib/validators/common'
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
} from './lib/validators/marketplace'
import {
  seedRankingReleaseStatusValidator,
  seedRunStatusValidator,
  seedTemplateReleaseStatusValidator,
} from './lib/validators/seedPipeline'
const boardSourceTemplateValidator = v.object({
  id: v.union(v.id('templates'), v.null()),
  category: v.union(templateCategoryValidator, v.null()),
  sizeClass: v.union(templateSizeClassValidator, v.null()),
  title: v.union(v.string(), v.null()),
})

const boardSourceRankingValidator = v.object({
  id: v.union(v.id('publishedRankings'), v.null()),
  title: v.union(v.string(), v.null()),
})

export default defineSchema({
  // @convex-dev/auth tables — authAccounts, authSessions, authVerificationCodes,
  // authRefreshTokens, authRateLimits. do not rename or move — managed by the lib
  ...authTables,

  // dev-only quiescence marker used by destructive local reset to make
  // self-rescheduling maintenance jobs exit instead of racing table wipes
  devResetLocks: defineTable({
    deploymentMarker: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index('byExpiresAt', ['expiresAt']),

  // users table extended w/ app-specific fields alongside auth-managed ones.
  // auth-managed fields remain writable only by the auth library; app-managed
  // fields populated on first sign-in. do not duplicate auth indexes here
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    externalId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarStorageId: v.optional(v.id('_storage')),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    plan: v.optional(userPlanValidator),
    lastUpsertError: v.optional(v.string()),
    // public-profile fields — surfaced via /u/:handle once that route exists.
    // handle is lowercase a-z/0-9/_/- ; uniqueness enforced via byHandle index
    handle: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    defaultTemplateVisibility: v.optional(templateVisibilityValidator),
    defaultRankingVisibility: v.optional(rankingVisibilityValidator),
    showInMembersDirectory: v.optional(v.boolean()),
    hideProfileFromSearch: v.optional(v.boolean()),
    allowAiTraining: v.optional(v.boolean()),
  })
    // indexes required by @convex-dev/auth - must match authTables.users
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('byAvatarStorageId', ['avatarStorageId'])
    .index('byHandle', ['handle']),

  // per-user global app preferences — mirrors AppPreferences from contracts
  userPreferences: defineTable({
    userId: v.id('users'),
    preferences: appPreferencesValidator,
    updatedAt: v.number(),
  }).index('byUser', ['userId']),

  // top-level board — owned by a user, referenced by tiers, items, & short links
  boards: defineTable({
    externalId: v.string(),
    ownerId: v.id('users'),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
    revision: v.number(),
    // slot aspect ratio (w/h); null -> 1 (square)
    itemAspectRatio: v.union(v.number(), v.null()),
    // 'auto' tracks content, 'manual' pins to itemAspectRatio; null -> auto
    itemAspectRatioMode: v.union(
      v.literal('auto'),
      v.literal('manual'),
      v.null()
    ),
    // suppresses the mixed-ratio modal on this board.
    aspectRatioPromptDismissed: v.boolean(),
    // board-wide fit when an item has no override; null -> cover
    defaultItemImageFit: v.union(
      v.literal('cover'),
      v.literal('contain'),
      v.null()
    ),
    // board-wide plate inset when an item has no override; null/absent ->
    // plate-aware fallback (DEFAULT_ITEM_IMAGE_PADDING for plated items, else 0).
    // optional so boards predating this field stay valid on schema push
    defaultItemImagePadding: v.optional(v.union(v.number(), v.null())),
    // Source attribution captured at fork/remix time. Leaf fields are nullable
    // so the no-source case stays indexable; writers update the object as a
    // unit so id/category/title cannot drift independently.
    sourceTemplate: boardSourceTemplateValidator,
    sourceRanking: boardSourceRankingValidator,
    // whether the fork counter has already ticked for this board. flips true
    // the first time a sourceTemplate.id-bearing board lands server-side
    // (useTemplate insert, large-clone completion, or first local-fork sync)
    forkCounted: v.boolean(),
    // fork source criterion; publish modal uses it as the default lane
    preferredCriterionExternalId: v.union(v.string(), v.null()),
    livePublicTemplateId: v.union(v.id('templates'), v.null()),
    // latest public ranking sourced from this board; absent/null -> none
    livePublicRankingId: v.optional(
      v.union(v.id('publishedRankings'), v.null())
    ),
    cloudState: boardCloudStateValidator,
    materializationState: boardMaterializationStateValidator,
    cloudBackedAt: v.union(v.number(), v.null()),
    pausedReason: v.union(boardPausedReasonValidator, v.null()),
    activeItemCount: v.number(),
    unrankedItemCount: v.number(),
    templateProgressState: v.union(
      v.literal('none'),
      v.literal('in-progress'),
      v.literal('complete')
    ),
    librarySummary: boardLibrarySummaryValidator,
    // per-board override of the user-default tier palette; null -> user default
    paletteId: v.union(paletteIdValidator, v.null()),
    // per-board override of the user-default text style; null -> user default
    textStyleId: v.union(textStyleIdValidator, v.null()),
    // per-board page background color override; null -> user default
    pageBackground: v.union(v.string(), v.null()),
    // per-board label rendering defaults; null -> inherit AppPreferences.showLabels
    // & built-in defaults
    labels: v.union(boardLabelSettingsValidator, v.null()),
    // per-board logo backdrop; absent -> On+Auto default
    autoPlate: v.optional(boardAutoPlateSettingsValidator),
    seedDatasetKey: v.union(v.string(), v.null()),
    seedReleaseId: v.union(v.string(), v.null()),
    seedExternalId: v.union(v.string(), v.null()),
    seedContentHash: v.union(v.string(), v.null()),
    seedKind: v.union(
      v.literal('ranking-sample'),
      v.literal('ranking-curated'),
      v.null()
    ),
    seedReleaseStatus: v.union(seedRankingReleaseStatusValidator, v.null()),
  })
    // ordered index powering getMyBoards & getMyDeletedBoards — eq on (ownerId,
    // deletedAt) + order('desc') yields the active or deleted set sorted by
    // most-recently-updated first
    .index('byOwnerDeletedUpdatedAt', ['ownerId', 'deletedAt', 'updatedAt'])
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byOwnerDeletedTemplateProgressUpdatedAt', [
      'ownerId',
      'deletedAt',
      'templateProgressState',
      'updatedAt',
    ])
    .index('byDeletedAt', ['deletedAt'])
    .index('bySourceTemplateId', ['sourceTemplate.id'])
    .index('bySeedDatasetReleaseAndExternalId', [
      'seedDatasetKey',
      'seedReleaseId',
      'seedExternalId',
    ]),

  // tier row within a board — ordered via sparse fractional "order" numbers
  boardTiers: defineTable({
    boardId: v.id('boards'),
    externalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.optional(tierColorSpecValidator),
    order: v.number(),
  }).index('byBoard', ['boardId', 'order']),

  // single item within a board — either placed in a tier or null for unranked
  boardItems: defineTable({
    boardId: v.id('boards'),
    tierId: v.union(v.id('boardTiers'), v.null()),
    externalId: v.string(),
    label: v.optional(v.string()),
    backgroundColor: v.optional(v.string()),
    mediaPlate: v.optional(mediaPlateValidator),
    altText: v.optional(v.string()),
    // private per-item editor notes; synced across devices, never read by
    // marketplace publish mappers (publish cherry-picks fields explicitly)
    notes: v.optional(v.string()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    deletedAt: v.union(v.number(), v.null()),
    // natural image aspect ratio captured at import time
    aspectRatio: v.optional(v.number()),
    // per-item crop override (object-fit fallback when no manual transform)
    imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
    // per-item manual crop transform — when set, overrides imageFit at render
    transform: v.optional(itemTransformValidator),
    // per-item plate inset (fraction of cell edge); absent -> board default
    imagePadding: v.optional(v.number()),
    // per-tile label rendering override; absent -> inherit board/global defaults
    labelOptions: v.optional(itemLabelOptionsValidator),
    // source marketplace item for future aggregate-ranking features
    templateItemId: v.optional(v.id('templateItems')),
  })
    .index('byBoardAndTier', ['boardId', 'tierId', 'order'])
    .index('byBoardDeletedAtOrder', ['boardId', 'deletedAt', 'order'])
    .index('byBoardAndTemplateItem', ['boardId', 'templateItemId'])
    .index('byMedia', ['mediaAssetId'])
    // global tombstone sweep: the daily gcDeletedBoardItems cron hard-deletes
    // aged item tombstones on live boards so churn can't grow boardItems past
    // the sync read limit (BOARD_ITEM_TAKE_LIMIT) & strand a board
    .index('byDeletedAt', ['deletedAt']),

  // logical uploaded image identity; physical blobs live in mediaVariants
  mediaAssets: defineTable({
    ownerId: v.id('users'),
    externalId: v.string(),
    dedupeHash: v.string(),
    tileVariant: mediaVariantSummaryValidator,
    previewVariant: v.optional(mediaVariantSummaryValidator),
    editorVariant: v.optional(mediaVariantSummaryValidator),
    createdAt: v.number(),
  })
    .index('byExternalId', ['externalId'])
    .index('byOwnerAndExternalId', ['ownerId', 'externalId'])
    .index('byOwnerAndDedupeHash', ['ownerId', 'dedupeHash']),

  mediaVariants: defineTable({
    mediaAssetId: v.id('mediaAssets'),
    kind: mediaVariantKindValidator,
    storageId: v.id('_storage'),
    width: v.number(),
    height: v.number(),
    byteSize: v.number(),
    mimeType: v.string(),
    contentHash: v.string(),
    createdAt: v.number(),
  })
    .index('byMediaAssetAndKind', ['mediaAssetId', 'kind'])
    .index('byStorageId', ['storageId'])
    .index('byContentHash', ['contentHash']),

  // reusable tier structure owned by a user — independent of boards
  tierPresets: defineTable({
    externalId: v.string(),
    ownerId: v.id('users'),
    name: v.string(),
    tiers: tierPresetTiersValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byOwner', ['ownerId', 'updatedAt'])
    // ordered lookup for ownership-scoped externalId resolution — lets the
    // preset CRUD mutations short-circuit a separate ownership check after
    // the row lookup
    .index('byOwnerAndExternalId', ['ownerId', 'externalId']),

  // public marketplace template — publishable item set w/ optional suggested tiers
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
    // when the author hasn't framed yet — runtime falls back to full-image
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
    // pre-baked label rendering defaults — forked boards inherit these so the
    // publisher's caption styling shows up without each user toggling labels
    labels: v.union(boardLabelSettingsValidator, v.null()),
    // per-board logo backdrop pinned at publish; absent -> On+Auto default
    autoPlate: v.optional(boardAutoPlateSettingsValidator),
    // seed identity fields let Python diff/upsert by stable external IDs
    // while user-published templates continue to omit them
    seedDatasetKey: v.optional(v.string()),
    seedExternalId: v.optional(v.string()),
    seedReleaseId: v.optional(v.string()),
    seedReleaseStatus: v.optional(seedTemplateReleaseStatusValidator),
    seedMetadataContentHash: v.optional(v.string()),
    seedItemsContentHash: v.optional(v.string()),
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

  // durable visibility for Python seed attempts. reports stay local, but this
  // row lets server precheck/cleanup see the current release/run state
  seedRuns: defineTable({
    runId: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    status: seedRunStatusValidator,
    finishedAt: v.union(v.number(), v.null()),
    startedBy: v.string(),
    templateCount: v.number(),
    itemCount: v.number(),
    imageVariantCount: v.number(),
    error: v.union(v.string(), v.null()),
  })
    .index('byRunId', ['runId'])
    .index('byDatasetRelease', ['datasetKey', 'releaseId'])
    .index('byDatasetStatus', ['datasetKey', 'status']),

  seedRunStorageUploads: defineTable({
    runId: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    storageId: v.id('_storage'),
    status: v.union(
      v.literal('uploaded'),
      v.literal('resolved'),
      v.literal('cleaned')
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byRun', ['datasetKey', 'releaseId', 'runId'])
    .index('byStorageId', ['storageId']),

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

  publishedRankings: defineTable({
    slug: v.string(),
    ownerId: v.id('users'),
    // source* attribution stays flat (vs. boards.sourceTemplate's nested
    // object) — rankings always have a source, fields are set once at publish
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
    // band='all' sort indexes — let .paginate() walk the B-tree at storage
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

  // "tier list of tier lists" (tlotl) — the profile showcase. one row per
  // owner; tiers & placed ranking lanes live in child tables. the unranked
  // pool is derived (owner's published lanes minus placed), never stored
  profileShowcases: defineTable({
    ownerId: v.id('users'),
    tileMode: v.union(
      v.literal('cover'),
      v.literal('mini'),
      v.literal('topRow'),
      v.literal('cropped'),
      v.literal('summary'),
      v.literal('winners')
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('byOwner', ['ownerId']),

  // tier row within a profile showcase — mirrors boardTiers so the workspace
  // editor's tier data maps in & out w/o translation
  profileShowcaseTiers: defineTable({
    showcaseId: v.id('profileShowcases'),
    externalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.optional(tierColorSpecValidator),
    order: v.number(),
  }).index('byShowcase', ['showcaseId', 'order']),

  // a published-ranking lane placed in a showcase tier. references the lane
  // (template + criterion), not a ranking instance, so it follows the owner's
  // current published ranking across re-publishes. unplaced lanes are derived
  profileShowcaseItems: defineTable({
    showcaseId: v.id('profileShowcases'),
    tierExternalId: v.string(),
    templateId: v.id('templates'),
    criterionExternalId: v.string(),
    order: v.number(),
  }).index('byShowcase', ['showcaseId', 'order']),

  // short URL indirection for shareable snapshot blobs. slug -> compressed
  // BoardSnapshot bytes in _storage
  shortLinks: defineTable({
    slug: v.string(),
    ownerId: v.id('users'),
    snapshotStorageId: v.id('_storage'),
    createdAt: v.number(),
    expiresAt: v.number(),
    boardTitle: v.string(),
  })
    .index('bySlug', ['slug'])
    .index('byOwnerAndExpiresAt', ['ownerId', 'expiresAt'])
    .index('byExpiresAt', ['expiresAt'])
    .index('bySnapshotStorageId', ['snapshotStorageId']),
})
