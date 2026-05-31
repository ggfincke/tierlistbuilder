// convex/marketplace/templates/lib/board.ts
// materialize a template into board tiers/items rows for fork & use flows

import type { MutationCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import {
  generateItemId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  DEFAULT_BOARD_TITLE,
  pickCoverRenderFields,
} from '@tierlistbuilder/contracts/workspace/board'
import { loadPreviewOrTileStorageId } from '../../../lib/mediaVariants'
import type { BoardLibrarySummaryItem } from '../../../workspace/boards/librarySummary'

export const templateTitleToBoardTitle = (title: string): string =>
  title.trim() || DEFAULT_BOARD_TITLE

export const insertBoardTiers = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  tiers: readonly TierPresetTier[]
): Promise<Id<'boardTiers'>[]> =>
  await Promise.all(
    tiers.map((tier, order) =>
      ctx.db.insert('boardTiers', {
        boardId,
        externalId: generateTierId(),
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order,
      })
    )
  )

export const buildBoardItemInsertFromTemplateItem = (
  boardId: Id<'boards'>,
  item: Doc<'templateItems'>,
  externalId: string = generateItemId()
) => ({
  boardId,
  tierId: null,
  externalId,
  label: item.label ?? undefined,
  backgroundColor: item.backgroundColor ?? undefined,
  mediaPlate: item.mediaPlate ?? undefined,
  altText: item.altText ?? undefined,
  mediaAssetId: item.mediaAssetId,
  order: item.order,
  deletedAt: null,
  aspectRatio: item.aspectRatio ?? undefined,
  imageFit: item.imageFit ?? undefined,
  transform: item.transform ?? undefined,
  imagePadding: item.imagePadding ?? undefined,
  templateItemId: item._id,
})

export const buildTemplateItemInsert = (
  templateId: Id<'templates'>,
  item: Doc<'boardItems'>,
  order: number
) => ({
  templateId,
  externalId: item.externalId,
  label: item.label ?? null,
  backgroundColor: item.backgroundColor ?? null,
  mediaPlate: item.mediaPlate ?? null,
  altText: item.altText ?? null,
  mediaAssetId: item.mediaAssetId,
  order,
  aspectRatio: item.aspectRatio ?? null,
  imageFit: item.imageFit ?? null,
  transform: item.transform ?? null,
  imagePadding: item.imagePadding ?? null,
})

export const insertBoardItemsFromTemplate = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  templateItems: readonly Doc<'templateItems'>[]
): Promise<BoardLibrarySummaryItem[]> =>
{
  const rows = await Promise.all(
    templateItems.map(async (item) =>
    {
      const storageId = item.mediaAssetId
        ? await loadPreviewOrTileStorageId(ctx, item.mediaAssetId)
        : null
      const externalId = generateItemId()

      return {
        insert: buildBoardItemInsertFromTemplateItem(boardId, item, externalId),
        summary: {
          tierKey: null,
          externalId,
          label: item.label,
          storageId,
          order: item.order,
          deletedAt: null,
          ...pickCoverRenderFields(item),
        },
      }
    })
  )

  await Promise.all(rows.map((row) => ctx.db.insert('boardItems', row.insert)))
  return rows.map((row) => row.summary)
}
