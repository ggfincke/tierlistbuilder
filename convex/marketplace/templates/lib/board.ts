// convex/marketplace/templates/lib/board.ts
// materialize a template into board tiers/items rows for fork & use flows

import type { MutationCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import {
  generateItemId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { DEFAULT_BOARD_TITLE } from '@tierlistbuilder/contracts/workspace/board'
import { pickCoverRenderFields } from '@tierlistbuilder/contracts/workspace/libraryBoard'

import { loadTileStorageId } from '../../../lib/mediaVariants'
import type { BoardLibrarySummaryItem } from '../../../workspace/boards/librarySummary'
import { resolveStyleItemAsset, type StyleResolvedAsset } from './styles'

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

// build a board item from a template item, resolving the active style's image
// fields (default style -> the template item's own image). label/background stay
// style-invariant on the template item
export const buildBoardItemInsertFromTemplateItem = (
  boardId: Id<'boards'>,
  item: Doc<'templateItems'>,
  externalId: string = generateItemId(),
  resolved: StyleResolvedAsset = resolveStyleItemAsset(item, null)
) => ({
  boardId,
  tierId: null,
  externalId,
  label: item.label ?? undefined,
  backgroundColor: item.backgroundColor ?? undefined,
  mediaPlate: resolved.mediaPlate ?? undefined,
  // alt text is per-style (resolver falls back to the template item for default)
  altText: resolved.altText ?? undefined,
  mediaAssetId: resolved.mediaAssetId,
  order: item.order,
  deletedAt: null,
  aspectRatio: resolved.aspectRatio ?? undefined,
  imageFit: resolved.imageFit ?? undefined,
  transform: resolved.transform ?? undefined,
  imagePadding: resolved.imagePadding ?? undefined,
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
  templateItems: readonly Doc<'templateItems'>[],
  styleAssets: ReadonlyMap<string, Doc<'templateItemStyleAssets'>> = new Map()
): Promise<BoardLibrarySummaryItem[]> =>
{
  const rows = await Promise.all(
    templateItems.map(async (item) =>
    {
      const resolved = resolveStyleItemAsset(
        item,
        styleAssets.get(item.externalId) ?? null
      )
      const storageId = resolved.mediaAssetId
        ? await loadTileStorageId(ctx, resolved.mediaAssetId)
        : null
      const externalId = generateItemId()

      return {
        insert: buildBoardItemInsertFromTemplateItem(
          boardId,
          item,
          externalId,
          resolved
        ),
        summary: {
          tierKey: null,
          externalId,
          label: item.label,
          storageId,
          order: item.order,
          deletedAt: null,
          ...pickCoverRenderFields({
            backgroundColor: item.backgroundColor,
            mediaPlate: resolved.mediaPlate,
            aspectRatio: resolved.aspectRatio,
            imageFit: resolved.imageFit,
            transform: resolved.transform,
            imagePadding: resolved.imagePadding,
          }),
        },
      }
    })
  )

  await Promise.all(rows.map((row) => ctx.db.insert('boardItems', row.insert)))
  return rows.map((row) => row.summary)
}
