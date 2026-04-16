// src/features/workspace/boards/data/cloud/boardMapper.ts
// BoardSnapshot <-> cloud upsertBoardState wire format

import type {
  BoardSnapshot,
  TierItem,
  Tier,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId, TierId } from '@tierlistbuilder/contracts/lib/ids'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  CloudBoardItemWire,
  CloudBoardPayload,
  CloudBoardState,
  CloudBoardTierWire,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { BoardImageUploadResult } from './imageUploader'

const DELETED_ITEM_ORDER = -1

const resolveItemMediaExternalId = (
  item: TierItem,
  uploadResult: BoardImageUploadResult
): string | null | undefined =>
{
  if (!item.imageRef && !item.imageUrl)
  {
    return null
  }

  const uploadedExternalId = item.imageRef?.hash
    ? uploadResult.mediaExternalIdByHash.get(item.imageRef.hash)
    : undefined

  if (uploadedExternalId)
  {
    return uploadedExternalId
  }

  const uploadedInlineExternalId = uploadResult.mediaExternalIdByItemId.get(
    item.id
  )
  if (uploadedInlineExternalId)
  {
    return uploadedInlineExternalId
  }

  if (item.imageRef?.cloudMediaExternalId)
  {
    return item.imageRef.cloudMediaExternalId
  }

  // both the inline-image path & the hash-backed path must throw consistently.
  // the uploader is now all-or-nothing, so any unresolved media at this point
  // is a bug (or a stale cache) that should block the sync loudly rather than
  // silently drop a reference
  throw new Error(
    `Unable to sync image for item ${item.id}: missing cloud media mapping.`
  )
}

// convert a local BoardSnapshot into the cloud upsert payload.
// mediaExternalIds must be resolved by the caller before mapping
export const snapshotToCloudPayload = (
  snapshot: BoardSnapshot,
  uploadResult: BoardImageUploadResult
): CloudBoardPayload =>
{
  const tiers: CloudBoardTierWire[] = snapshot.tiers.map((tier) => ({
    externalId: tier.id,
    name: tier.name,
    description: tier.description,
    colorSpec: tier.colorSpec,
    rowColorSpec: tier.rowColorSpec,
    itemIds: tier.itemIds.map(String),
  }))

  const items: CloudBoardItemWire[] = []
  let orderCounter = 0

  // active items in tier order, then unranked
  for (const tier of snapshot.tiers)
  {
    for (const itemId of tier.itemIds)
    {
      const item = snapshot.items[itemId]
      if (!item) continue

      items.push({
        externalId: item.id,
        tierId: tier.id,
        label: item.label,
        backgroundColor: item.backgroundColor,
        altText: item.altText,
        mediaExternalId: resolveItemMediaExternalId(item, uploadResult),
        order: orderCounter++,
      })
    }
  }

  for (const itemId of snapshot.unrankedItemIds)
  {
    const item = snapshot.items[itemId]
    if (!item) continue

    items.push({
      externalId: item.id,
      tierId: null,
      label: item.label,
      backgroundColor: item.backgroundColor,
      altText: item.altText,
      mediaExternalId: resolveItemMediaExternalId(item, uploadResult),
      order: orderCounter++,
    })
  }

  // include deleted items in the items array so the server knows about them
  for (const item of snapshot.deletedItems)
  {
    items.push({
      externalId: item.id,
      tierId: null,
      label: item.label,
      backgroundColor: item.backgroundColor,
      altText: item.altText,
      mediaExternalId: resolveItemMediaExternalId(item, uploadResult),
      order: DELETED_ITEM_ORDER,
    })
  }

  const deletedItemIds = snapshot.deletedItems.map((item) => item.id)

  return { title: snapshot.title, tiers, items, deletedItemIds }
}

// convert server state to a local BoardSnapshot. mediaExternalId -> hash
// reverse mapping must be provided by the caller
export const serverStateToSnapshot = (
  serverState: CloudBoardState,
  mediaReverseMap: Map<string, string>
): BoardSnapshot =>
{
  const items: Record<ItemId, TierItem> = {}

  const activeItems: typeof serverState.items = []
  const deletedItems: typeof serverState.items = []
  for (const item of serverState.items)
  {
    ;(item.deletedAt === null ? activeItems : deletedItems).push(item)
  }

  for (const item of serverState.items)
  {
    const mediaExternalId = item.mediaExternalId ?? undefined
    const hash = mediaExternalId
      ? mediaReverseMap.get(mediaExternalId)
      : undefined

    items[asItemId(item.externalId)] = {
      id: asItemId(item.externalId),
      imageRef:
        hash && mediaExternalId
          ? { hash, cloudMediaExternalId: mediaExternalId }
          : undefined,
      label: item.label,
      backgroundColor: item.backgroundColor,
      altText: item.altText,
    }
  }

  const sortedTiers = serverState.tiers
    .slice()
    .sort((a, b) => a.order - b.order)

  const tiers: Tier[] = sortedTiers.map((t) => ({
    id: t.externalId as TierId,
    name: t.name,
    description: t.description,
    colorSpec: t.colorSpec,
    rowColorSpec: t.rowColorSpec,
    itemIds: t.itemIds.map(asItemId),
  }))

  // unranked = active items not in any tier
  const tieredItemIds = new Set(sortedTiers.flatMap((t) => t.itemIds))
  const unrankedItemIds = activeItems
    .filter((i) => !tieredItemIds.has(i.externalId))
    .sort((a, b) => a.order - b.order)
    .map((i) => asItemId(i.externalId))

  return {
    title: serverState.title,
    tiers,
    unrankedItemIds,
    items,
    deletedItems: deletedItems
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
      .map((i) => items[asItemId(i.externalId)]),
  }
}
