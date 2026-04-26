// src/features/workspace/boards/data/cloud/boardMapper.ts
// BoardSnapshot <-> cloud upsertBoardState wire format

import type {
  BoardSnapshot,
  TierItemImageRef,
  TierItem,
  Tier,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  asItemId,
  asTierId,
  type ItemId,
} from '@tierlistbuilder/contracts/lib/ids'
import type {
  CloudBoardItemWire,
  CloudBoardPayload,
  CloudBoardState,
  CloudBoardTierWire,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { BoardImageUploadResult } from '~/features/platform/media/imageUploader'

const DELETED_ITEM_ORDER = -1

interface ResolvedItemMediaExternalIds
{
  mediaExternalId: string | null | undefined
  sourceMediaExternalId: string | null | undefined
}

const resolveImageRefMediaExternalId = (
  ref: TierItemImageRef | undefined,
  uploadResult: BoardImageUploadResult,
  item: TierItem,
  fieldName: 'imageRef' | 'sourceImageRef'
): string | null | undefined =>
{
  if (!ref)
  {
    return null
  }

  const uploadedExternalId = uploadResult.mediaExternalIdByHash.get(ref.hash)
  if (uploadedExternalId)
  {
    return uploadedExternalId
  }

  if (ref.cloudMediaExternalId)
  {
    return ref.cloudMediaExternalId
  }

  // uploader is all-or-nothing; any unresolved media is a bug or stale cache —
  // block the sync loudly rather than silently drop a reference
  throw new Error(
    `Unable to sync ${fieldName} for item ${item.id}: missing cloud media mapping.`
  )
}

const resolveItemMediaExternalIds = (
  item: TierItem,
  uploadResult: BoardImageUploadResult
): ResolvedItemMediaExternalIds => ({
  mediaExternalId: resolveImageRefMediaExternalId(
    item.imageRef,
    uploadResult,
    item,
    'imageRef'
  ),
  sourceMediaExternalId: resolveImageRefMediaExternalId(
    item.sourceImageRef,
    uploadResult,
    item,
    'sourceImageRef'
  ),
})

const toCloudItemWire = (
  item: TierItem,
  tierId: string | null,
  order: number,
  uploadResult: BoardImageUploadResult
): CloudBoardItemWire =>
{
  const media = resolveItemMediaExternalIds(item, uploadResult)
  return {
    externalId: item.id,
    tierId,
    label: item.label,
    backgroundColor: item.backgroundColor,
    altText: item.altText,
    ...media,
    order,
    aspectRatio: item.aspectRatio,
    imageFit: item.imageFit,
    transform: item.transform,
  }
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

      items.push(toCloudItemWire(item, tier.id, orderCounter++, uploadResult))
    }
  }

  for (const itemId of snapshot.unrankedItemIds)
  {
    const item = snapshot.items[itemId]
    if (!item) continue

    items.push(toCloudItemWire(item, null, orderCounter++, uploadResult))
  }

  // include deleted items in the items array so the server knows about them
  for (const item of snapshot.deletedItems)
  {
    items.push(toCloudItemWire(item, null, DELETED_ITEM_ORDER, uploadResult))
  }

  const deletedItemIds = snapshot.deletedItems.map((item) => item.id)

  return {
    title: snapshot.title,
    tiers,
    items,
    deletedItemIds,
    itemAspectRatio: snapshot.itemAspectRatio,
    itemAspectRatioMode: snapshot.itemAspectRatioMode,
    aspectRatioPromptDismissed: snapshot.aspectRatioPromptDismissed,
    defaultItemImageFit: snapshot.defaultItemImageFit,
  }
}

// convert cloud server state to a local BoardSnapshot. images are wired
// from the server's contentHash + externalId — the lazy fetcher hydrates
// blobs into IDB on first render
export const serverStateToSnapshot = (
  serverState: CloudBoardState
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
    const mediaContentHash = item.mediaContentHash
    const sourceMediaExternalId = item.sourceMediaExternalId ?? undefined
    const sourceMediaContentHash = item.sourceMediaContentHash

    items[asItemId(item.externalId)] = {
      id: asItemId(item.externalId),
      imageRef:
        mediaContentHash && mediaExternalId
          ? {
              hash: mediaContentHash,
              cloudMediaExternalId: mediaExternalId,
            }
          : undefined,
      sourceImageRef:
        sourceMediaContentHash && sourceMediaExternalId
          ? {
              hash: sourceMediaContentHash,
              cloudMediaExternalId: sourceMediaExternalId,
            }
          : undefined,
      label: item.label,
      backgroundColor: item.backgroundColor,
      altText: item.altText,
      aspectRatio: item.aspectRatio,
      imageFit: item.imageFit,
      transform: item.transform,
    }
  }

  const sortedTiers = serverState.tiers
    .slice()
    .sort((a, b) => a.order - b.order)

  const tiers: Tier[] = sortedTiers.map((t) => ({
    id: asTierId(t.externalId),
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
    itemAspectRatio: serverState.itemAspectRatio,
    itemAspectRatioMode: serverState.itemAspectRatioMode,
    aspectRatioPromptDismissed: serverState.aspectRatioPromptDismissed,
    defaultItemImageFit: serverState.defaultItemImageFit,
  }
}
