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
  // string -> set media, null -> clear media, undefined -> preserve existing media
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
  // sha256 of the asset bytes — lets the client wire image refs into IDB on
  // cloud-pull or keep-cloud resolution for items uploaded on another device.
  // undefined when the item has no image
  mediaContentHash?: string
}

export interface CloudBoardState
{
  title: string
  revision: number
  tiers: CloudBoardStateTier[]
  items: CloudBoardStateItem[]
}
