// packages/contracts/workspace/cloudBoard.ts
// shared cloud board wire contracts used by client sync & server reconciliation

import type { TierColorSpec } from '../lib/theme'

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
}

export interface CloudBoardPayload
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

export interface CloudBoardState
{
  title: string
  revision: number
  tiers: CloudBoardStateTier[]
  items: CloudBoardStateItem[]
}
