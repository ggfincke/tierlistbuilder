// convex/workspace/sync/boardStateLoader.ts
// builds a CloudBoardState payload from server rows — shared by the
// upsertBoardState conflict path & the getBoardStateByExternalId query

import { ConvexError } from 'convex/values'
import type { QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { BOARD_TOMBSTONE_RETENTION_MS } from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export const loadBoardCloudState = async (
  ctx: QueryCtx,
  board: Doc<'boards'>,
  serverTiers: Doc<'boardTiers'>[],
  serverItems: Doc<'boardItems'>[]
): Promise<CloudBoardState> =>
{
  const mediaIds = new Set<Id<'mediaAssets'>>()
  for (const item of serverItems)
  {
    if (item.mediaAssetId) mediaIds.add(item.mediaAssetId)
  }

  const mediaIdToInfo = new Map<
    Id<'mediaAssets'>,
    { externalId: string; contentHash: string }
  >()
  const assets = await Promise.all(
    [...mediaIds].map(async (id) =>
    {
      const asset = await ctx.db.get(id)
      if (!asset)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: `dangling media reference in server state: ${id} (board ${board._id})`,
        })
      }
      return [id, asset] as const
    })
  )
  for (const [id, asset] of assets)
  {
    mediaIdToInfo.set(id, {
      externalId: asset.externalId,
      contentHash: asset.contentHash,
    })
  }

  const tierIdToExternalId = new Map<Id<'boardTiers'>, string>()
  for (const tier of serverTiers)
  {
    tierIdToExternalId.set(tier._id, tier.externalId)
  }

  const tierItemIds = new Map<string, string[]>()
  for (const tier of serverTiers)
  {
    tierItemIds.set(tier.externalId, [])
  }

  const sortedActiveItems = serverItems
    .filter((i) => i.deletedAt === null)
    .sort((a, b) => a.order - b.order)

  for (const item of sortedActiveItems)
  {
    if (!item.tierId) continue
    const tierExtId = tierIdToExternalId.get(item.tierId)
    if (tierExtId)
    {
      tierItemIds.get(tierExtId)?.push(item.externalId)
    }
  }

  const tombstoneCutoff = Date.now() - BOARD_TOMBSTONE_RETENTION_MS
  const itemsForPayload = serverItems.filter(
    (item) => item.deletedAt === null || item.deletedAt >= tombstoneCutoff
  )

  return {
    title: board.title,
    revision: board.revision ?? 0,
    itemAspectRatio: board.itemAspectRatio,
    itemAspectRatioMode: board.itemAspectRatioMode,
    aspectRatioPromptDismissed: board.aspectRatioPromptDismissed,
    defaultItemImageFit: board.defaultItemImageFit,
    tiers: serverTiers
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        externalId: t.externalId,
        name: t.name,
        description: t.description,
        colorSpec: t.colorSpec,
        rowColorSpec: t.rowColorSpec,
        order: t.order,
        itemIds: tierItemIds.get(t.externalId) ?? [],
      })),
    items: itemsForPayload.map((item) =>
    {
      const mediaInfo = item.mediaAssetId
        ? mediaIdToInfo.get(item.mediaAssetId)
        : undefined
      return {
        externalId: item.externalId,
        tierId: item.tierId
          ? (tierIdToExternalId.get(item.tierId) ?? null)
          : null,
        label: item.label,
        backgroundColor: item.backgroundColor,
        altText: item.altText,
        mediaExternalId: mediaInfo?.externalId,
        mediaContentHash: mediaInfo?.contentHash,
        order: item.order,
        deletedAt: item.deletedAt,
        aspectRatio: item.aspectRatio,
        imageFit: item.imageFit,
      }
    }),
  }
}
