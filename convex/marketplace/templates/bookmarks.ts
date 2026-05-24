// convex/marketplace/templates/bookmarks.ts
// signed-in template bookmark reads & toggles

import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type {
  MarketplaceTemplateBookmarkListResult,
  MarketplaceTemplateBookmarkState,
  MarketplaceTemplateBookmarkToggleResult,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  MAX_TEMPLATE_LIST_LIMIT,
  isTemplateSlug,
} from '@tierlistbuilder/contracts/marketplace/template'
import { clamp } from '@tierlistbuilder/contracts/lib/math'
import { getCurrentUserId, requireCurrentUserId } from '../../lib/auth'
import {
  marketplaceTemplateBookmarkListResultValidator,
  marketplaceTemplateBookmarkStateValidator,
} from '../../lib/validators/marketplace'
import { findTemplateBySlug } from '../../lib/marketplaceLookups'
import { createTemplateProjectionCache } from './lib/trending'
import {
  findTemplateCardByTemplateId,
  toTemplateCardSummary,
} from './lib/projections'
import { isPublishedTemplateRow } from './lib/state'

type DbCtx = QueryCtx | MutationCtx

const emptyBookmarkListResult = (
  cursor: string | null
): MarketplaceTemplateBookmarkListResult => ({
  page: [],
  isDone: true,
  continueCursor: cursor ?? '',
})

const normalizeBookmarkPageSize = (raw: number): number =>
{
  if (!Number.isFinite(raw)) return DEFAULT_TEMPLATE_LIST_LIMIT
  return clamp(Math.floor(raw), 1, MAX_TEMPLATE_LIST_LIMIT)
}

const findBookmark = async (
  ctx: DbCtx,
  userId: Id<'users'>,
  templateId: Id<'templates'>
): Promise<Doc<'userTemplateBookmarks'> | null> =>
  await ctx.db
    .query('userTemplateBookmarks')
    .withIndex('byUserTemplate', (q) =>
      q.eq('userId', userId).eq('templateId', templateId)
    )
    .unique()

export const getTemplateBookmarkState = query({
  args: { templateSlug: v.string() },
  returns: marketplaceTemplateBookmarkStateValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateBookmarkState> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId || !isTemplateSlug(args.templateSlug))
    {
      return { saved: false, savedAt: null }
    }

    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template || !isPublishedTemplateRow(template))
    {
      return { saved: false, savedAt: null }
    }

    const bookmark = await findBookmark(ctx, userId, template._id)
    return {
      saved: bookmark !== null,
      savedAt: bookmark?.createdAt ?? null,
    }
  },
})

export const toggleTemplateBookmark = mutation({
  args: {
    templateSlug: v.string(),
    saved: v.optional(v.boolean()),
  },
  returns: marketplaceTemplateBookmarkStateValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateBookmarkToggleResult> =>
  {
    if (!isTemplateSlug(args.templateSlug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template || !isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const now = Date.now()
    const bookmark = await findBookmark(ctx, userId, template._id)
    const shouldSave = args.saved ?? bookmark === null
    if (shouldSave)
    {
      if (bookmark)
      {
        return { saved: true, savedAt: bookmark.createdAt }
      }
      await ctx.db.insert('userTemplateBookmarks', {
        userId,
        templateId: template._id,
        createdAt: now,
        updatedAt: now,
      })
      return { saved: true, savedAt: now }
    }

    if (bookmark)
    {
      await ctx.db.delete(bookmark._id)
    }
    return { saved: false, savedAt: null }
  },
})

export const listMyTemplateBookmarks = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: marketplaceTemplateBookmarkListResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateBookmarkListResult> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return emptyBookmarkListResult(args.paginationOpts.cursor)
    }

    const result = await ctx.db
      .query('userTemplateBookmarks')
      .withIndex('byUserCreatedAt', (q) => q.eq('userId', userId))
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        numItems: normalizeBookmarkPageSize(args.paginationOpts.numItems),
      })
    const cache = createTemplateProjectionCache()
    const page = await Promise.all(
      result.page.map(async (bookmark) =>
      {
        const card = await findTemplateCardByTemplateId(
          ctx,
          bookmark.templateId
        )
        // Cross-check publicationState so a card sync gap cannot surface a private row.
        if (
          !card ||
          !card.isPubliclyListable ||
          !isPublishedTemplateRow(card)
        )
        {
          return null
        }
        return {
          template: await toTemplateCardSummary(ctx, card, cache),
          savedAt: bookmark.createdAt,
        }
      })
    )
    return {
      ...result,
      page: page.filter((row): row is NonNullable<typeof row> => row !== null),
    }
  },
})
