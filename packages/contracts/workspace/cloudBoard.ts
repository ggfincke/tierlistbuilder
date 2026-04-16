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
  // client-side wall-clock stamp when the item was last edited. plumbed
  // through for a future last-writer-wins conflict resolver — the server
  // currently stores it but does not enforce ordering. omit on boards that
  // predate this field; reconciler treats missing as "infinitely old"
  clientUpdatedAt?: number
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
  // sha256 of the underlying asset bytes — surfaced so the client can wire
  // image refs straight into IDB on a cloud-pull / keep-cloud resolution
  // for items whose blobs were uploaded on another device. undefined when
  // the item has no image
  mediaContentHash?: string
}

export interface CloudBoardState
{
  title: string
  revision: number
  tiers: CloudBoardStateTier[]
  items: CloudBoardStateItem[]
}
