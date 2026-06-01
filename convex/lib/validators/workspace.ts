// convex/lib/validators/workspace.ts
// workspace board, library, & tier-preset validators

import type { Infer } from 'convex/values'
import { v } from 'convex/values'
import {
  type BoardListItem,
  type DeletedBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  BOARD_CLOUD_STATES,
  BOARD_MATERIALIZATION_STATES,
  BOARD_PAUSED_REASONS,
  LIBRARY_BOARD_VISIBILITIES,
  PUBLISH_STATES,
  SYNC_STATES,
  type BoardCloudState,
  type BoardMaterializationState,
  type BoardPausedReason,
  type LibraryBoardListItem,
} from '@tierlistbuilder/contracts/workspace/libraryBoard'

import type {
  CloudBoardState,
  CloudBoardStateItem,
  CloudBoardStateTier,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import type { BoardLibrarySummary } from '../../workspace/boards/librarySummary'
import {
  type _Assert,
  type _Exact,
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  imageFitValidator,
  itemLabelOptionsValidator,
  itemTransformValidator,
  literalUnion,
  mediaPlateValidator,
  optionalItemRenderFields,
  paletteIdValidator,
  textStyleIdValidator,
  tierColorSpecValidator,
  tierPresetTiersValidator,
} from './common'
import { mediaVariantKindValidator } from './platform'
import {
  templateCategoryValidator,
  templateCoverFramingValidator,
  templateMediaRefValidator,
  templateSizeClassValidator,
} from './marketplace'
import { showcaseMiniSnapshotValidator } from '../../social/showcase/validators'

const boardListItemBaseFields = {
  externalId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  revision: v.number(),
}

export const boardListItemValidator = v.object(boardListItemBaseFields)

export const deletedBoardListItemValidator = v.object({
  ...boardListItemBaseFields,
  deletedAt: v.number(),
})

const publishStateValidator = literalUnion(PUBLISH_STATES)
const syncStateValidator = literalUnion(SYNC_STATES)
const libraryBoardVisibilityValidator = literalUnion(LIBRARY_BOARD_VISIBILITIES)

export const boardCloudStateValidator = literalUnion(BOARD_CLOUD_STATES)
export const boardMaterializationStateValidator = literalUnion(
  BOARD_MATERIALIZATION_STATES
)
export const boardPausedReasonValidator = literalUnion(BOARD_PAUSED_REASONS)

const libraryBoardCoverItemValidator = v.object({
  label: v.union(v.string(), v.null()),
  externalId: v.string(),
  mediaUrl: v.union(v.string(), v.null()),
  mediaHash: v.optional(v.string()),
  mediaCloudExternalId: v.optional(v.string()),
  mediaVariant: v.optional(mediaVariantKindValidator),
  ...optionalItemRenderFields,
})

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
      ...optionalItemRenderFields,
    })
  ),
  tierCount: v.number(),
  tierColors: v.array(tierColorSpecValidator),
  tierBreakdown: v.array(libraryBoardTierBreakdownValidator),
})

export const libraryBoardListItemValidator = v.object({
  ...boardListItemBaseFields,
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
  autoPlate: v.optional(v.union(boardAutoPlateSettingsValidator, v.null())),
  defaultItemImageFit: v.optional(v.union(imageFitValidator, v.null())),
  defaultItemImagePadding: v.optional(v.union(v.number(), v.null())),
  itemAspectRatio: v.optional(v.union(v.number(), v.null())),
  paletteId: paletteIdValidator,
  tierCount: v.number(),
  tierColors: v.array(tierColorSpecValidator),
  tierBreakdown: v.array(libraryBoardTierBreakdownValidator),
  mini: v.union(showcaseMiniSnapshotValidator, v.null()),
  pinned: v.boolean(),
})

const cloudBoardStateTierValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.optional(tierColorSpecValidator),
  itemIds: v.array(v.string()),
  order: v.number(),
})

const cloudBoardStateItemValidator = v.object({
  externalId: v.string(),
  tierId: v.union(v.string(), v.null()),
  label: v.optional(v.string()),
  backgroundColor: v.optional(v.string()),
  mediaPlate: v.optional(mediaPlateValidator),
  altText: v.optional(v.string()),
  notes: v.optional(v.string()),
  mediaExternalId: v.optional(v.union(v.string(), v.null())),
  previewMediaContentHash: v.optional(v.string()),
  mediaContentHash: v.optional(v.string()),
  sourceMediaContentHash: v.optional(v.string()),
  order: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  aspectRatio: v.optional(v.number()),
  imageFit: v.optional(imageFitValidator),
  transform: v.optional(itemTransformValidator),
  imagePadding: v.optional(v.number()),
  labelOptions: v.optional(itemLabelOptionsValidator),
  sourceTemplateItemExternalId: v.optional(v.string()),
})

export const cloudBoardStateValidator = v.object({
  title: v.string(),
  revision: v.number(),
  itemAspectRatio: v.optional(v.number()),
  itemAspectRatioMode: v.optional(
    v.union(v.literal('auto'), v.literal('manual'))
  ),
  aspectRatioPromptDismissed: v.optional(v.boolean()),
  defaultItemImageFit: v.optional(imageFitValidator),
  defaultItemImagePadding: v.optional(v.number()),
  paletteId: v.optional(paletteIdValidator),
  textStyleId: v.optional(textStyleIdValidator),
  pageBackground: v.optional(v.string()),
  labels: v.optional(boardLabelSettingsValidator),
  autoPlate: v.optional(boardAutoPlateSettingsValidator),
  sourceTemplateId: v.optional(v.union(v.string(), v.null())),
  sourceRankingId: v.optional(v.union(v.string(), v.null())),
  sourceTemplateTitle: v.optional(v.union(v.string(), v.null())),
  sourceRankingTitle: v.optional(v.union(v.string(), v.null())),
  preferredCriterionExternalId: v.optional(v.union(v.string(), v.null())),
  tiers: v.array(cloudBoardStateTierValidator),
  items: v.array(cloudBoardStateItemValidator),
})

export const tierPresetCloudRowValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  tiers: tierPresetTiersValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
})

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
export type _BoardListItemExact = _Assert<
  _Exact<BoardListItem, Infer<typeof boardListItemValidator>>
>
export type _DeletedBoardListItemExact = _Assert<
  _Exact<DeletedBoardListItem, Infer<typeof deletedBoardListItemValidator>>
>
export type _LibraryBoardListItemExact = _Assert<
  _Exact<LibraryBoardListItem, Infer<typeof libraryBoardListItemValidator>>
>
export type _BoardLibrarySummaryExact = _Assert<
  _Exact<BoardLibrarySummary, Infer<typeof boardLibrarySummaryValidator>>
>
export type _CloudBoardStateTierExact = _Assert<
  _Exact<CloudBoardStateTier, Infer<typeof cloudBoardStateTierValidator>>
>
export type _CloudBoardStateItemExact = _Assert<
  _Exact<CloudBoardStateItem, Infer<typeof cloudBoardStateItemValidator>>
>
export type _CloudBoardStateExact = _Assert<
  _Exact<CloudBoardState, Infer<typeof cloudBoardStateValidator>>
>
export type _TierPresetCloudRowExact = _Assert<
  _Exact<TierPresetCloudRow, Infer<typeof tierPresetCloudRowValidator>>
>
