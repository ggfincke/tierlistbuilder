// convex/workspace/boards/switchImageStyle.ts
// live image-style (skin) switch for a server-resident board: re-point every
// style-linked item to the target style & leave user-pinned items untouched

import { ConvexError, v } from 'convex/values'
import { mutation } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'
import { requireBoardOwnershipByExternalId } from '../../lib/permissions'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'
import { loadTemplateItems } from '../../marketplace/templates/lib/projections'
import {
  isAllowedTemplateStyle,
  loadTemplateStyles,
  resolveEffectiveStyleId,
  resolveStyleAndAssets,
  resolveStyleItemAsset,
} from '../../marketplace/templates/lib/styles'
import { buildCloneBoardSummary } from '../../marketplace/templates/internal'
import { buildRenderSourceFields } from '../../lib/templates/renderFields'
import { getBoardSourceTemplateId } from './sourceFields'

export const switchBoardImageStyle = mutation({
  args: {
    boardExternalId: v.string(),
    styleId: v.union(v.string(), v.null()),
  },
  returns: v.object({
    revision: v.number(),
    imageStyleId: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ revision: number; imageStyleId: string | null }> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )
    if (board.deletedAt !== null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.boardDeleted,
        message: 'cannot switch the style of a deleted board',
      })
    }
    const sourceTemplateId = getBoardSourceTemplateId(board)
    if (sourceTemplateId === null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'board is not template-backed; no styles to switch',
      })
    }
    const template = await ctx.db.get(sourceTemplateId)
    if (!template)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'source template not found',
      })
    }

    const styles = await loadTemplateStyles(ctx, sourceTemplateId)
    const effectiveStyleId = resolveEffectiveStyleId(
      template,
      styles,
      args.styleId
    )
    // normalize the board's current style the same way (null/legacy -> default)
    // so selecting the default on a board w/o an explicit imageStyleId no-ops
    // instead of needlessly re-pointing every item
    const currentStyleId = resolveEffectiveStyleId(
      template,
      styles,
      board.imageStyleId ?? undefined
    )
    // a stored id that no longer names a live style (removed by reseed) is a dead
    // pointer: items still show the old skin while currentStyleId resolves to default.
    // force the switch through so selecting default repairs the board vs the no-op below
    const storedStyleIsStale =
      board.imageStyleId != null &&
      !isAllowedTemplateStyle(
        template.defaultStyleId,
        styles,
        board.imageStyleId
      )
    // no-op when already on the target skin — never bump revision needlessly
    if (effectiveStyleId === currentStyleId && !storedStyleIsStale)
    {
      return {
        revision: board.revision,
        imageStyleId: board.imageStyleId ?? null,
      }
    }

    // throttle past the no-op check so only real switches cost a token; scoped
    // per board so toggling one board can't exhaust the whole account's budget
    await enforceRateLimit(ctx, 'userBoardStyleSwitch', userId, {
      scope: board._id,
    })

    const { serverItems } = await loadBoundedBoardRows(ctx, board._id)
    const templateItems = await loadTemplateItems(ctx, sourceTemplateId)
    const templateItemById = new Map(
      templateItems.map((item) => [item._id, item])
    )
    const { styleRow, styleAssets } = await resolveStyleAndAssets(
      ctx,
      template,
      styles,
      effectiveStyleId
    )

    // re-point only style-linked, template-origin items; pinned (user-imported
    // or recropped) & user-added items are left exactly as they are
    await Promise.all(
      serverItems.map(async (item) =>
      {
        if (item.imageSource === 'pinned') return
        if (!item.templateItemId) return
        const templateItem = templateItemById.get(item.templateItemId)
        if (!templateItem) return
        const resolved = resolveStyleItemAsset(
          templateItem,
          styleAssets.get(templateItem.externalId) ?? null
        )
        await ctx.db.patch(item._id, {
          mediaAssetId: resolved.mediaAssetId,
          aspectRatio: resolved.aspectRatio ?? undefined,
          imageFit: resolved.imageFit ?? undefined,
          transform: resolved.transform ?? undefined,
          mediaPlate: resolved.mediaPlate ?? undefined,
          imagePadding: resolved.imagePadding ?? undefined,
          // alt text is per-style; clear it when the target skin doesn't override
          altText: resolved.altText ?? undefined,
        })
      })
    )

    const renderSource = styleRow ?? template
    const renderFields = buildRenderSourceFields(renderSource)

    const librarySummary = await buildCloneBoardSummary(ctx, board._id)
    const newRevision = board.revision + 1
    await ctx.db.patch(board._id, {
      imageStyleId: effectiveStyleId,
      ...renderFields,
      librarySummary,
      revision: newRevision,
      updatedAt: Date.now(),
    })
    return { revision: newRevision, imageStyleId: effectiveStyleId }
  },
})
