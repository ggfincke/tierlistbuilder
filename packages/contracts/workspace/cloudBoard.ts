// packages/contracts/workspace/cloudBoard.ts
// shared cloud board wire contracts used by client sync & server reconciliation

import type { TierColorSpec } from '../lib/theme'
import type { ImageFit, ItemAspectRatioMode } from './board'

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
  altText?: string
  mediaExternalId?: string | null
  order: number
  // natural image aspect ratio captured at import time
  aspectRatio?: number
  // per-item crop override
  imageFit?: ImageFit
}

// board-wide aspect-ratio config shared by payload & state so a synced board
// doesn't lose its ratio settings on a push/pull cycle
export interface CloudBoardAspectRatioFields
{
  itemAspectRatio?: number
  itemAspectRatioMode?: ItemAspectRatioMode
  aspectRatioPromptDismissed?: boolean
  defaultItemImageFit?: ImageFit
}

export interface CloudBoardPayload extends CloudBoardAspectRatioFields
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
  mediaContentHash?: string
}

export interface CloudBoardState extends CloudBoardAspectRatioFields
{
  title: string
  revision: number
  tiers: CloudBoardStateTier[]
  items: CloudBoardStateItem[]
}
