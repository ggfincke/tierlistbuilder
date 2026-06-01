// convex/schema/workspace.ts
// workspace board, item, tier, & preset tables

import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  templateCategoryValidator,
  templateSizeClassValidator,
} from '../lib/validators/marketplace'
import {
  boardCloudStateValidator,
  boardLibrarySummaryValidator,
  boardMaterializationStateValidator,
  boardPausedReasonValidator,
} from '../lib/validators/workspace'
import {
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  itemImageSourceValidator,
  itemLabelOptionsValidator,
  itemTransformValidator,
  mediaPlateValidator,
  paletteIdValidator,
  textStyleIdValidator,
  tierColorSpecValidator,
  tierPresetTiersValidator,
} from '../lib/validators/common'
import { seedRankingReleaseStatusValidator } from '../lib/validators/seedPipeline'

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

export const workspaceTables = {
  // top-level board - owned by a user, referenced by tiers, items, & short links
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
    // active image style (skin) externalId; absent/null -> source template
    // default style. set at fork time & on a live skin switch
    imageStyleId: v.optional(v.union(v.string(), v.null())),
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
    // ordered index powering getMyBoards & getMyDeletedBoards - eq on (ownerId,
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
  // tier row within a board - ordered via sparse fractional "order" numbers
  boardTiers: defineTable({
    boardId: v.id('boards'),
    externalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    colorSpec: tierColorSpecValidator,
    rowColorSpec: v.optional(tierColorSpecValidator),
    order: v.number(),
  }).index('byBoard', ['boardId', 'order']),
  // single item within a board - either placed in a tier or null for unranked
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
    // per-item manual crop transform - when set, overrides imageFit at render
    transform: v.optional(itemTransformValidator),
    // per-item plate inset (fraction of cell edge); absent -> board default
    imagePadding: v.optional(v.number()),
    // per-tile label rendering override; absent -> inherit board/global defaults
    labelOptions: v.optional(itemLabelOptionsValidator),
    // source marketplace item for future aggregate-ranking features
    templateItemId: v.optional(v.id('templateItems')),
    // whether this item's image follows the active board style ('linked', the
    // default) or is user-owned ('pinned'); pinned survives a skin switch
    imageSource: v.optional(itemImageSourceValidator),
  })
    .index('byBoardAndTier', ['boardId', 'tierId', 'order'])
    .index('byBoardDeletedAtOrder', ['boardId', 'deletedAt', 'order'])
    .index('byBoardAndTemplateItem', ['boardId', 'templateItemId'])
    .index('byMedia', ['mediaAssetId'])
    // global tombstone sweep: the daily gcDeletedBoardItems cron hard-deletes
    // aged item tombstones on live boards so churn can't grow boardItems past
    // the sync read limit (BOARD_ITEM_TAKE_LIMIT) & strand a board
    .index('byDeletedAt', ['deletedAt']),
  // reusable tier structure owned by a user - independent of boards
  tierPresets: defineTable({
    externalId: v.string(),
    ownerId: v.id('users'),
    name: v.string(),
    tiers: tierPresetTiersValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byOwner', ['ownerId', 'updatedAt'])
    // ordered lookup for ownership-scoped externalId resolution - lets the
    // preset CRUD mutations short-circuit a separate ownership check after
    // the row lookup
    .index('byOwnerAndExternalId', ['ownerId', 'externalId']),
}
