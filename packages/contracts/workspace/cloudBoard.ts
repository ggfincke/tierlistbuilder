// packages/contracts/workspace/cloudBoard.ts
// shared cloud board wire contracts used by client sync & server reconciliation

import type { PaletteId, TextStyleId, TierColorSpec } from '../lib/theme'
import type {
  BoardAutoPlateSettings,
  BoardLabelSettings,
  ImageFit,
  ItemAspectRatioMode,
  ItemLabelOptions,
  ItemTransform,
  MediaPlate,
  TierItem,
} from './board'

// cloud board sync caps; server enforces these before writing row diffs.
// clients/tests import the same contract so limit-edge behavior stays explicit
export const MAX_CLOUD_BOARD_TIERS = 50
export const MAX_STANDARD_CLOUD_BOARD_ITEMS = 200
export const MAX_LARGE_CLOUD_BOARD_ITEMS = 2000

export interface CloudBoardTierWire
{
  externalId: string
  name: string
  description?: string
  colorSpec: TierColorSpec
  rowColorSpec?: TierColorSpec
  itemIds: string[]
}

export interface CloudBoardItemWire
{
  externalId: string
  tierId: string | null
  label?: string
  backgroundColor?: string
  mediaPlate?: MediaPlate
  altText?: string
  // private per-item editor notes; synced for cross-device parity, never
  // surfaced on published rankings (publish mappers cherry-pick fields)
  notes?: string
  mediaExternalId?: string | null
  order: number
  // natural image aspect ratio captured at import time
  aspectRatio?: number
  // per-item crop override
  imageFit?: ImageFit
  // per-item manual crop transform
  transform?: ItemTransform
  // per-item plate inset (fraction of cell edge)
  imagePadding?: number
  // per-tile label rendering override; absent -> inherit board/global
  labelOptions?: ItemLabelOptions
  // source template item external id carried by local forks until first sync
  // resolves it to boardItems.templateItemId.
  sourceTemplateItemExternalId?: string
}

type _AssertNever<T extends never> = T

type CloudBoardItemLocalOnlyField =
  | 'id'
  | 'imageRef'
  | 'tileImageRef'
  | 'sourceImageRef'
  | 'showcaseRanking'

export type CloudBoardItemScalarField = Exclude<
  keyof TierItem,
  CloudBoardItemLocalOnlyField
>

export const CLOUD_BOARD_ITEM_SCALAR_FIELDS = [
  'label',
  'backgroundColor',
  'mediaPlate',
  'altText',
  'notes',
  'aspectRatio',
  'imageFit',
  'transform',
  'imagePadding',
  'labelOptions',
  'sourceTemplateItemExternalId',
] as const satisfies readonly CloudBoardItemScalarField[]

// fails if the runtime scalar manifest drifts from the item wire scalar type
const _cloudBoardItemScalarFieldsExact: _AssertNever<
  | Exclude<
      CloudBoardItemScalarField,
      (typeof CLOUD_BOARD_ITEM_SCALAR_FIELDS)[number]
    >
  | Exclude<
      (typeof CLOUD_BOARD_ITEM_SCALAR_FIELDS)[number],
      CloudBoardItemScalarField
    >
> = undefined as never
void _cloudBoardItemScalarFieldsExact

// board-wide aspect-ratio config shared by payload & state so a synced board
// doesn't lose its ratio settings on a push/pull cycle
interface CloudBoardAspectRatioFields
{
  itemAspectRatio?: number
  itemAspectRatioMode?: ItemAspectRatioMode
  aspectRatioPromptDismissed?: boolean
  defaultItemImageFit?: ImageFit
  defaultItemImagePadding?: number
}

// per-board overrides of user-default style — palette/text style/page bg.
// shared by state read & sync push so a per-board override survives a push/pull
// cycle. all fields optional; absent means "inherit user default"
interface CloudBoardStyleOverrideFields
{
  paletteId?: PaletteId
  textStyleId?: TextStyleId
  pageBackground?: string
  labels?: BoardLabelSettings
  autoPlate?: BoardAutoPlateSettings
}

// source-fork identity carried on every sync push. server consults these only
// on the INSERT path (first sync of a locally-created fork) — subsequent syncs
// of the same board ignore them so the server stays the source of truth
interface CloudBoardSourceFields
{
  sourceTemplateId?: string
  sourceRankingId?: string
  sourceTemplateTitle?: string
  sourceRankingTitle?: string
  preferredCriterionExternalId?: string
}

export interface CloudBoardPayload
  extends
    CloudBoardAspectRatioFields,
    CloudBoardStyleOverrideFields,
    CloudBoardSourceFields
    {
  title: string
  tiers: CloudBoardTierWire[]
  items: CloudBoardItemWire[]
  deletedItemIds: string[]
}

export interface CloudBoardStateTier extends CloudBoardTierWire
{
  order: number
}

export interface CloudBoardStateItem extends CloudBoardItemWire
{
  deletedAt: number | null
  previewMediaContentHash?: string
  mediaContentHash?: string
  sourceMediaContentHash?: string
}

export interface CloudBoardState
  extends CloudBoardAspectRatioFields, CloudBoardStyleOverrideFields
  {
  title: string
  revision: number
  // source-template/ranking identity captured at fork/remix time — null on
  // boards created from scratch. drives the workspace breadcrumb after a
  // pull-down of cloud state mirrors what was saved locally on the originator
  sourceTemplateId?: string | null
  sourceRankingId?: string | null
  sourceTemplateTitle?: string | null
  sourceRankingTitle?: string | null
  preferredCriterionExternalId?: string | null
  tiers: CloudBoardStateTier[]
  items: CloudBoardStateItem[]
}
