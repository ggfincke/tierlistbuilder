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
  CloudBoardItemScalarField,
  CloudBoardPayload,
  CloudBoardState,
  CloudBoardTierWire,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { CLOUD_BOARD_ITEM_SCALAR_FIELDS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { BoardImageUploadResult } from '~/features/platform/media/imageUploader'
import { assignNormalizedItemScalars } from '~/shared/board-data/boardNormalizers'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import { getRenditionEntries, type RenditionKey } from '~/shared/lib/imageRefs'

const DELETED_ITEM_ORDER = -1

interface ResolvedItemMediaExternalIds
{
  mediaExternalId: string | null | undefined
}

const resolveImageRefMediaExternalId = (
  ref: TierItemImageRef | undefined,
  uploadResult: BoardImageUploadResult,
  item: TierItem,
  fieldName: RenditionKey
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

  // uploader is all-or-nothing; any unresolved media is a bug or stale cache —
  // block the sync loudly rather than silently drop a reference
  throw new Error(
    `Unable to sync ${fieldName} for item ${item.id}: missing cloud media mapping.`
  )
}

const resolveItemMediaExternalIds = (
  item: TierItem,
  uploadResult: BoardImageUploadResult
): ResolvedItemMediaExternalIds =>
{
  const itemExternalId = uploadResult.mediaExternalIdByItemId.get(item.id)
  if (itemExternalId)
  {
    return { mediaExternalId: itemExternalId }
  }

  for (const [fieldName, ref] of getRenditionEntries(item, 'board'))
  {
    const externalId = resolveImageRefMediaExternalId(
      ref,
      uploadResult,
      item,
      fieldName
    )
    if (externalId)
    {
      return { mediaExternalId: externalId }
    }
  }

  return { mediaExternalId: null }
}

const pickCloudItemScalars = (
  item: TierItem
): Pick<CloudBoardItemWire, CloudBoardItemScalarField> =>
{
  const fields: Partial<Record<CloudBoardItemScalarField, unknown>> = {}
  for (const field of CLOUD_BOARD_ITEM_SCALAR_FIELDS)
  {
    const value = item[field]
    if (value !== undefined) fields[field] = value
  }
  return fields as Pick<CloudBoardItemWire, CloudBoardItemScalarField>
}

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
    ...pickCloudItemScalars(item),
    ...media,
    order,
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
    defaultItemImagePadding: snapshot.defaultItemImagePadding,
    paletteId: snapshot.paletteId,
    textStyleId: snapshot.textStyleId,
    pageBackground: snapshot.pageBackground,
    labels: snapshot.labels,
    autoPlate: snapshot.autoPlate,
    imageStyleId: snapshot.imageStyleId,
    // source-fork identity travels on every push; server uses it only on insert
    // source cover fields stay local-only; library rows rehydrate from source data
    sourceTemplateId: snapshot.sourceTemplateId,
    sourceRankingId: snapshot.sourceRankingId,
    sourceTemplateTitle: snapshot.sourceTemplateTitle,
    sourceRankingTitle: snapshot.sourceRankingTitle,
    preferredCriterionExternalId: snapshot.preferredCriterionExternalId,
  }
}

const toCloudImageRef = (
  hash: string | undefined,
  mediaExternalId: string | undefined
): TierItemImageRef | undefined =>
  hash && mediaExternalId
    ? {
        hash,
        cloudMediaExternalId: mediaExternalId,
      }
    : undefined

const cloudItemToSnapshotItem = (
  item: CloudBoardState['items'][number]
): TierItem =>
{
  const id = asItemId(item.externalId)
  const mediaExternalId = item.mediaExternalId ?? undefined
  const snapshotItem: TierItem = {
    id,
    imageRef: toCloudImageRef(item.previewMediaContentHash, mediaExternalId),
    tileImageRef: toCloudImageRef(item.mediaContentHash, mediaExternalId),
    sourceImageRef: toCloudImageRef(
      item.sourceMediaContentHash,
      mediaExternalId
    ),
  }
  assignNormalizedItemScalars(snapshotItem, item)
  return snapshotItem
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

  // single pass: split active/deleted & build the items record
  for (const item of serverState.items)
  {
    if (item.deletedAt === null)
    {
      activeItems.push(item)
      const snapshotItem = cloudItemToSnapshotItem(item)
      items[snapshotItem.id] = snapshotItem
    }
    else
    {
      deletedItems.push(item)
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

  const tieredItemIds = new Set(sortedTiers.flatMap((t) => t.itemIds))
  const unrankedItemIds = activeItems
    .filter((i) => !tieredItemIds.has(i.externalId))
    .sort((a, b) => a.order - b.order)
    .map((i) => asItemId(i.externalId))

  const rawSnapshot: BoardSnapshot = {
    title: serverState.title,
    tiers,
    unrankedItemIds,
    items,
    deletedItems: deletedItems
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
      .map(cloudItemToSnapshotItem),
    itemAspectRatio: serverState.itemAspectRatio,
    itemAspectRatioMode: serverState.itemAspectRatioMode,
    aspectRatioPromptDismissed: serverState.aspectRatioPromptDismissed,
    defaultItemImageFit: serverState.defaultItemImageFit,
    defaultItemImagePadding: serverState.defaultItemImagePadding,
    paletteId: serverState.paletteId,
    textStyleId: serverState.textStyleId,
    pageBackground: serverState.pageBackground,
    labels: serverState.labels,
    autoPlate: serverState.autoPlate,
    imageStyleId: serverState.imageStyleId,
    // server-side board carries source identity; lift to the snapshot so the
    // BoardHeader breadcrumb renders immediately on cloud-board activation
    sourceTemplateId: serverState.sourceTemplateId ?? undefined,
    sourceRankingId: serverState.sourceRankingId ?? undefined,
    sourceTemplateTitle: serverState.sourceTemplateTitle ?? undefined,
    sourceRankingTitle: serverState.sourceRankingTitle ?? undefined,
    preferredCriterionExternalId:
      serverState.preferredCriterionExternalId ?? undefined,
  }

  return normalizeBoardSnapshot(
    rawSnapshot,
    serverState.paletteId ?? 'classic',
    serverState.title
  )
}
