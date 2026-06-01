// convex/workspace/sync/boardStateLoader.ts
// builds a CloudBoardState payload from server rows — shared by the
// upsertBoardState conflict path & the getBoardStateByExternalId query

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

// read-only over ctx.db — usable from both the getBoardStateByExternalId query
// & the upsertBoardState mutation's conflict path
type ReadCtx = QueryCtx | MutationCtx
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { BOARD_TOMBSTONE_RETENTION_MS } from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  getBoardSourceRankingId,
  getBoardSourceTemplateId,
} from '../boards/sourceFields'

// client-facing source identity uses public slugs since signed-out users can
// only ever know the slug. resolve typed table ids -> slugs at load time so
// the wire stays slug-based both ways (push & pull)
const loadSourceTemplateSlug = async (
  ctx: ReadCtx,
  templateId: Id<'templates'> | null
): Promise<string | null> =>
{
  if (!templateId) return null
  const template = await ctx.db.get(templateId)
  return template?.slug ?? null
}

const loadSourceRankingSlug = async (
  ctx: ReadCtx,
  rankingId: Id<'publishedRankings'> | null
): Promise<string | null> =>
{
  if (!rankingId) return null
  const ranking = await ctx.db.get(rankingId)
  return ranking?.slug ?? null
}

type MediaInfo = {
  externalId: string
  previewContentHash: string | null
  tileContentHash: string
  editorContentHash: string | null
}

export const loadBoardCloudState = async (
  ctx: ReadCtx,
  board: Doc<'boards'>,
  serverTiers: Doc<'boardTiers'>[],
  serverItems: Doc<'boardItems'>[]
): Promise<CloudBoardState> =>
{
  const mediaIds = new Set<Id<'mediaAssets'>>()
  const templateItemIds = new Set<Id<'templateItems'>>()
  for (const item of serverItems)
  {
    if (item.mediaAssetId) mediaIds.add(item.mediaAssetId)
    if (item.templateItemId) templateItemIds.add(item.templateItemId)
  }

  const mediaIdToInfo = new Map<Id<'mediaAssets'>, MediaInfo>()
  const templateItemIdToExternalId = new Map<Id<'templateItems'>, string>()
  const [assets, templateItems] = await Promise.all([
    Promise.all(
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
    ),
    Promise.all(
      [...templateItemIds].map(async (id) =>
      {
        const templateItem = await ctx.db.get(id)
        if (!templateItem)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message: `dangling template item reference in server state: ${id} (board ${board._id})`,
          })
        }
        return [id, templateItem] as const
      })
    ),
  ])
  for (const [id, asset] of assets)
  {
    mediaIdToInfo.set(id, {
      externalId: asset.externalId,
      previewContentHash: asset.previewVariant?.contentHash ?? null,
      tileContentHash: asset.tileVariant.contentHash,
      editorContentHash: asset.editorVariant?.contentHash ?? null,
    })
  }
  for (const [id, item] of templateItems)
  {
    templateItemIdToExternalId.set(id, item.externalId)
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
  const getMediaInfo = (id: Id<'mediaAssets'> | null): MediaInfo | undefined =>
    id ? mediaIdToInfo.get(id) : undefined

  // resolve source-fork identity in parallel w/ the items mapping below — both
  // wait on the same DB roundtrip latency, no need to serialize them
  const [sourceTemplateSlug, sourceRankingSlug] = await Promise.all([
    loadSourceTemplateSlug(ctx, getBoardSourceTemplateId(board)),
    loadSourceRankingSlug(ctx, getBoardSourceRankingId(board)),
  ])

  return {
    title: board.title,
    revision: board.revision,
    itemAspectRatio: board.itemAspectRatio ?? undefined,
    itemAspectRatioMode: board.itemAspectRatioMode ?? undefined,
    // omit when false so the wire payload stays minimal — the client treats
    // missing as "not dismissed"
    aspectRatioPromptDismissed: board.aspectRatioPromptDismissed
      ? true
      : undefined,
    defaultItemImageFit: board.defaultItemImageFit ?? undefined,
    defaultItemImagePadding: board.defaultItemImagePadding ?? undefined,
    paletteId: board.paletteId ?? undefined,
    textStyleId: board.textStyleId ?? undefined,
    pageBackground: board.pageBackground ?? undefined,
    labels: board.labels ?? undefined,
    autoPlate: board.autoPlate ?? undefined,
    imageStyleId: board.imageStyleId ?? undefined,
    // surface source-template/ranking identity as public slugs so the wire
    // stays slug-based both ways. titles are denormalized on the board record
    // so the breadcrumb survives even if the source template was unpublished
    sourceTemplateId: sourceTemplateSlug,
    sourceRankingId: sourceRankingSlug,
    sourceTemplateTitle: board.sourceTemplate.title,
    sourceRankingTitle: board.sourceRanking.title,
    preferredCriterionExternalId: board.preferredCriterionExternalId ?? null,
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
      const mediaInfo = getMediaInfo(item.mediaAssetId)
      return {
        externalId: item.externalId,
        tierId: item.tierId
          ? (tierIdToExternalId.get(item.tierId) ?? null)
          : null,
        label: item.label,
        backgroundColor: item.backgroundColor,
        mediaPlate: item.mediaPlate ?? undefined,
        altText: item.altText,
        notes: item.notes,
        mediaExternalId: mediaInfo?.externalId,
        previewMediaContentHash: mediaInfo?.previewContentHash ?? undefined,
        mediaContentHash: mediaInfo?.tileContentHash,
        sourceMediaContentHash: mediaInfo?.editorContentHash ?? undefined,
        order: item.order,
        deletedAt: item.deletedAt,
        aspectRatio: item.aspectRatio,
        imageFit: item.imageFit,
        transform: item.transform,
        imagePadding: item.imagePadding,
        labelOptions: item.labelOptions,
        sourceTemplateItemExternalId: item.templateItemId
          ? templateItemIdToExternalId.get(item.templateItemId)
          : undefined,
        imageSource: item.imageSource,
      }
    }),
  }
}
