// convex/schema.ts
// * convex database schema — tables for workspace, platform, & community domains

import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  appPreferencesValidator,
  boardCloudStateValidator,
  boardLabelSettingsValidator,
  boardLibrarySummaryValidator,
  boardMaterializationStateValidator,
  boardPausedReasonValidator,
  itemLabelOptionsValidator,
  itemTransformValidator,
  mediaVariantKindValidator,
  mediaVariantSummaryValidator,
  paletteIdValidator,
  templateCardCoverItemValidator,
  templateCardMediaValidator,
  templateCategoryValidator,
  templateJobStatusValidator,
  templatePublicationStateValidator,
  rankingPublicationStateValidator,
  rankingVisibilityValidator,
  templateSizeClassValidator,
  templateVisibilityValidator,
  textStyleIdValidator,
  tierColorSpecValidator,
  tierPresetTiersValidator,
  userPlanValidator,
} from './lib/validators'

export default defineSchema({
  // @convex-dev/auth tables — authAccounts, authSessions, authVerificationCodes,
  // authRefreshTokens, authRateLimits. do not rename or move — managed by the lib
  ...authTables,

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
    revision: v.optional(v.number()),
    // slot aspect ratio (w/h); absent -> 1 (square)
    itemAspectRatio: v.optional(v.number()),
    // 'auto' tracks content, 'manual' pins to itemAspectRatio
    itemAspectRatioMode: v.optional(
      v.union(v.literal('auto'), v.literal('manual'))
    ),
    // suppresses the mixed-ratio modal on this board
    aspectRatioPromptDismissed: v.optional(v.boolean()),
    // board-wide fit when an item has no override
    defaultItemImageFit: v.optional(
      v.union(v.literal('cover'), v.literal('contain'))
    ),
    // source template for boards created through "Use this template"
    sourceTemplateId: v.union(v.id('templates'), v.null()),
    sourceTemplateCategory: v.union(templateCategoryValidator, v.null()),
    sourceTemplateSizeClass: v.union(templateSizeClassValidator, v.null()),
    livePublicTemplateId: v.union(v.id('templates'), v.null()),
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
    // per-board override of the user-default tier palette; absent -> user default
    paletteId: v.optional(paletteIdValidator),
    // per-board override of the user-default text style; absent -> user default
    textStyleId: v.optional(textStyleIdValidator),
    // per-board page background color override; absent -> user default
    pageBackground: v.optional(v.string()),
    // per-board label rendering defaults; absent -> inherit AppPreferences.showLabels
    // & built-in defaults
    labels: v.optional(boardLabelSettingsValidator),
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
    .index('bySourceTemplate', ['sourceTemplateId']),

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
    altText: v.optional(v.string()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    deletedAt: v.union(v.number(), v.null()),
    // natural image aspect ratio captured at import time
    aspectRatio: v.optional(v.number()),
    // per-item crop override (object-fit fallback when no manual transform)
    imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
    // per-item manual crop transform — when set, overrides imageFit at render
    transform: v.optional(itemTransformValidator),
    // per-tile label rendering override; absent -> inherit board/global defaults
    labelOptions: v.optional(itemLabelOptionsValidator),
    // source marketplace item for future aggregate-ranking features
    templateItemId: v.optional(v.id('templateItems')),
  })
    .index('byBoardAndTier', ['boardId', 'tierId', 'order'])
    .index('byBoardDeletedAtOrder', ['boardId', 'deletedAt', 'order'])
    .index('byBoardAndTemplateItem', ['boardId', 'templateItemId'])
    .index('byMedia', ['mediaAssetId']),

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
    .index('byStorageId', ['storageId']),

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
    coverItems: v.array(
      v.object({
        mediaAssetId: v.id('mediaAssets'),
        label: v.union(v.string(), v.null()),
        backgroundColor: v.union(v.string(), v.null()),
        aspectRatio: v.union(v.number(), v.null()),
        imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
        transform: v.union(itemTransformValidator, v.null()),
      })
    ),
    suggestedTiers: tierPresetTiersValidator,
    sourceBoardId: v.union(v.id('boards'), v.null()),
    sizeClass: templateSizeClassValidator,
    publicationState: templatePublicationStateValidator,
    isPubliclyListable: v.boolean(),
    itemCount: v.number(),
    featuredRank: v.union(v.number(), v.null()),
    creditLine: v.union(v.string(), v.null()),
    // slot aspect ratio (w/h) the template was designed against; absent ->
    // forks fall back to the board default (1, square)
    itemAspectRatio: v.optional(v.union(v.number(), v.null())),
    // 'auto' tracks content; 'manual' pins the ratio. seed action snaps to a
    // preset & writes 'manual' so forked boards land on the same canonical
    // ratio the per-item transforms were computed against
    itemAspectRatioMode: v.optional(
      v.union(v.literal('auto'), v.literal('manual'), v.null())
    ),
    // board-wide fit when an item has no per-item override on the forked board
    defaultItemImageFit: v.optional(
      v.union(v.literal('cover'), v.literal('contain'), v.null())
    ),
    // pre-baked label rendering defaults — forked boards inherit these so the
    // publisher's caption styling shows up without each user toggling labels
    labels: v.optional(boardLabelSettingsValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('bySlug', ['slug'])
    .index('byAuthorUpdatedAt', ['authorId', 'updatedAt'])
    .index('byCoverMedia', ['coverMediaAssetId']),

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
    featuredRank: v.union(v.number(), v.null()),
    useCount: v.number(),
    viewCount: v.number(),
    weeklyUseCount: v.optional(v.number()),
    weeklyViewCount: v.optional(v.number()),
    trendingScore: v.optional(v.number()),
    trendingComputedAt: v.optional(v.union(v.number(), v.null())),
    creditLine: v.union(v.string(), v.null()),
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byTemplateId', ['templateId'])
    .index('bySlug', ['slug'])
    .index('byAuthorUpdatedAt', ['authorId', 'updatedAt'])
    .index('byIsPubliclyListableUpdatedAt', ['isPubliclyListable', 'updatedAt'])
    .index('byIsPubliclyListableUseCount', ['isPubliclyListable', 'useCount'])
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
    .index('byCategoryIsPubliclyListableUseCount', [
      'category',
      'isPubliclyListable',
      'useCount',
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
    useCount: v.number(),
    viewCount: v.number(),
    updatedAt: v.number(),
  }).index('byTemplateId', ['templateId']),

  templateMetricDays: defineTable({
    templateId: v.id('templates'),
    category: templateCategoryValidator,
    dayStartAt: v.number(),
    useCount: v.number(),
    viewCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byTemplateDay', ['templateId', 'dayStartAt'])
    .index('byDayTemplate', ['dayStartAt', 'templateId']),

  marketplaceStats: defineTable({
    key: v.string(),
    publicTemplateCount: v.number(),
    // denormalized per-category breakdown of public template count. keys are
    // TemplateCategory values; categories w/ zero templates are absent so the
    // record stays compact across taxonomy churn
    publicTemplateCountByCategory: v.optional(v.record(v.string(), v.number())),
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
    .index('byTargetTemplate', ['targetTemplateId'])
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
    .index('byTargetBoard', ['targetBoardId'])
    .index('byOwnerSourceTemplateStatus', [
      'ownerId',
      'sourceTemplateId',
      'status',
    ])
    .index('bySourceTemplateStatus', ['sourceTemplateId', 'status']),

  // immutable-ish template item rows. rankings clone these into boardItems
  // as unranked entries, preserving templateItemId for future aggregation
  templateItems: defineTable({
    templateId: v.id('templates'),
    externalId: v.string(),
    label: v.union(v.string(), v.null()),
    backgroundColor: v.union(v.string(), v.null()),
    altText: v.union(v.string(), v.null()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    aspectRatio: v.union(v.number(), v.null()),
    imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
    transform: v.union(itemTransformValidator, v.null()),
  })
    .index('byTemplate', ['templateId', 'order'])
    .index('byTemplateAndExternalId', ['templateId', 'externalId'])
    .index('byMedia', ['mediaAssetId']),

  publishedRankings: defineTable({
    slug: v.string(),
    ownerId: v.id('users'),
    sourceTemplateId: v.id('templates'),
    sourceBoardId: v.id('boards'),
    sourceTemplateSlug: v.string(),
    sourceTemplateTitle: v.string(),
    sourceTemplateCategory: templateCategoryValidator,
    title: v.string(),
    description: v.union(v.string(), v.null()),
    visibility: rankingVisibilityValidator,
    publicationState: rankingPublicationStateValidator,
    isPubliclyListable: v.boolean(),
    itemCount: v.number(),
    tierCount: v.number(),
    remixCount: v.number(),
    viewCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('bySlug', ['slug'])
    .index('byOwnerUpdatedAt', ['ownerId', 'updatedAt'])
    .index('bySourceTemplatePublicUpdatedAt', [
      'sourceTemplateId',
      'isPubliclyListable',
      'updatedAt',
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
    altText: v.union(v.string(), v.null()),
    mediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    order: v.number(),
    aspectRatio: v.union(v.number(), v.null()),
    imageFit: v.union(v.literal('cover'), v.literal('contain'), v.null()),
    transform: v.union(itemTransformValidator, v.null()),
  })
    .index('byRanking', ['rankingId', 'order'])
    .index('byTemplateItem', ['templateItemId']),

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
