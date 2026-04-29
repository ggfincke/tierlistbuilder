// convex/marketplace/templates/mutations.ts
// template marketplace mutations for publishing, managing, & cloning templates

import { ConvexError, v } from 'convex/values'
import { mutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { generateBoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  normalizeBoardTitle,
  type ImageFit,
  type ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  MarketplaceTemplatePublishResult,
  MarketplaceTemplateUseResult,
  TemplateCategory,
  TemplateUseTierSelection,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  MAX_TEMPLATE_COVER_ITEMS,
  isTemplateSlug,
} from '@tierlistbuilder/contracts/marketplace/template'
import { requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import { failInput } from '../../lib/text'
import {
  findOwnedMediaAssetByExternalId,
  findOwnedTierPresetByExternalId,
  requireBoardOwnershipByExternalId,
} from '../../lib/permissions'
import { loadBoundedBoardRows } from '../../workspace/sync/loadBoundedBoardRows'
import {
  marketplaceTemplatePublishResultValidator,
  marketplaceTemplateUseResultValidator,
  templateCategoryValidator,
  templateVisibilityValidator,
  tierPresetTiersValidator,
} from '../../lib/validators'
import {
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  buildSearchText,
  DEFAULT_TEMPLATE_TIERS,
  findTemplateBySlug,
  insertBoardItemsFromTemplate,
  insertBoardTiers,
  isPublicTemplateRow,
  loadTemplateItems,
  normalizeCreditLine,
  normalizeDescription,
  normalizeTags,
  normalizeTemplateTitle,
  patchTemplateTagRows,
  requireOwnedTemplate,
  syncTemplateTagRows,
  templateTitleToBoardTitle,
  tiersFromBoardRows,
  toTemplateAuthor,
  validateTemplateTiers,
} from './lib'

const templateTierSelectionValidator = v.union(
  v.object({ kind: v.literal('template') }),
  v.object({ kind: v.literal('default') }),
  v.object({ kind: v.literal('preset'), presetExternalId: v.string() }),
  v.object({ kind: v.literal('custom'), tiers: tierPresetTiersValidator })
)

type TemplateTierSelection = TemplateUseTierSelection

const itemTransformOrNull = (
  transform: ItemTransform | undefined
): ItemTransform | null => transform ?? null

const imageFitOrNull = (imageFit: ImageFit | undefined): ImageFit | null =>
  imageFit ?? null

const resolveCoverMediaId = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  coverMediaExternalId: string | null | undefined,
  fallbackMediaAssetId: Id<'mediaAssets'> | null
): Promise<Id<'mediaAssets'> | null> =>
{
  if (coverMediaExternalId === undefined)
  {
    return fallbackMediaAssetId
  }
  if (coverMediaExternalId === null)
  {
    return null
  }

  const asset = await findOwnedMediaAssetByExternalId(
    ctx,
    coverMediaExternalId,
    userId
  )
  if (!asset)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `cover media not found or not owned: ${coverMediaExternalId}`,
    })
  }
  return asset._id
}

const resolveTemplateTiers = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  template: Doc<'templates'>,
  selection: TemplateTierSelection | undefined
) =>
{
  const mode = selection ?? { kind: 'template' as const }
  if (mode.kind === 'template')
  {
    return template.suggestedTiers.length > 0
      ? template.suggestedTiers
      : [...DEFAULT_TEMPLATE_TIERS]
  }
  if (mode.kind === 'default')
  {
    return [...DEFAULT_TEMPLATE_TIERS]
  }
  if (mode.kind === 'custom')
  {
    validateTemplateTiers(mode.tiers)
    return mode.tiers
  }

  const preset = await findOwnedTierPresetByExternalId(
    ctx,
    mode.presetExternalId,
    userId
  )
  if (!preset)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'tier preset not found',
    })
  }
  validateTemplateTiers(preset.tiers)
  return preset.tiers
}

export const publishFromBoard = mutation({
  args: {
    boardExternalId: v.string(),
    title: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    visibility: templateVisibilityValidator,
    coverMediaExternalId: v.optional(v.union(v.string(), v.null())),
    creditLine: v.optional(v.union(v.string(), v.null())),
  },
  returns: marketplaceTemplatePublishResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplatePublishResult> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await enforceRateLimit(ctx, 'userTemplatePublish', userId)

    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )
    if (board.deletedAt !== null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.boardDeleted,
        message: 'cannot publish a deleted board as a template',
      })
    }

    const title = normalizeTemplateTitle(args.title)
    const description = normalizeDescription(args.description)
    const creditLine = normalizeCreditLine(args.creditLine)
    const tags = normalizeTags(args.tags)
    const { serverTiers, serverItems } = await loadBoundedBoardRows(
      ctx,
      board._id
    )
    const activeItems = serverItems
      .filter((item) => item.deletedAt === null)
      .sort((a, b) => a.order - b.order)

    if (activeItems.length === 0)
    {
      failInput('cannot publish an empty template')
    }

    const author = await toTemplateAuthor(ctx, userId)
    const fallbackCoverMediaId =
      activeItems.find((item) => item.mediaAssetId !== null)?.mediaAssetId ??
      null
    const mediaBackedItems = activeItems
      .filter(
        (item): item is typeof item & { mediaAssetId: Id<'mediaAssets'> } =>
          item.mediaAssetId !== null
      )
      .slice(0, MAX_TEMPLATE_COVER_ITEMS)
    const coverItems = mediaBackedItems.map((item) => ({
      mediaAssetId: item.mediaAssetId,
      label: item.label ?? null,
    }))
    const coverMediaAssetId = await resolveCoverMediaId(
      ctx,
      userId,
      args.coverMediaExternalId,
      fallbackCoverMediaId
    )
    const suggestedTiers = tiersFromBoardRows(serverTiers)
    validateTemplateTiers(suggestedTiers)

    const now = Date.now()
    const slug = await allocateTemplateSlug(ctx)
    const templateId = await ctx.db.insert('templates', {
      slug,
      authorId: userId,
      title,
      description,
      category: args.category,
      tags,
      visibility: args.visibility,
      coverMediaAssetId,
      coverItems,
      suggestedTiers,
      sourceBoardExternalId: board.externalId,
      itemCount: activeItems.length,
      useCount: 0,
      viewCount: 0,
      featuredRank: null,
      creditLine,
      searchText: buildSearchText({
        title,
        description,
        category: args.category,
        tags,
        authorDisplayName: author.displayName,
      }),
      itemAspectRatio: board.itemAspectRatio ?? null,
      itemAspectRatioMode: board.itemAspectRatioMode ?? null,
      defaultItemImageFit: board.defaultItemImageFit ?? null,
      labels: board.labels ?? undefined,
      createdAt: now,
      updatedAt: now,
      unpublishedAt: null,
    })

    await Promise.all(
      activeItems.map((item, order) =>
        ctx.db.insert('templateItems', {
          templateId,
          externalId: item.externalId,
          label: item.label ?? null,
          backgroundColor: item.backgroundColor ?? null,
          altText: item.altText ?? null,
          mediaAssetId: item.mediaAssetId,
          order,
          aspectRatio: item.aspectRatio ?? null,
          imageFit: imageFitOrNull(item.imageFit),
          transform: itemTransformOrNull(item.transform),
        })
      )
    )
    if (args.visibility === 'public')
    {
      await adjustPublicTemplateCount(ctx, [
        { category: args.category, delta: 1 },
      ])
    }

    const inserted = await ctx.db.get(templateId)
    if (inserted)
    {
      await syncTemplateTagRows(ctx, inserted)
    }

    return { slug }
  },
})

export const updateMyTemplateMeta = mutation({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    category: v.optional(templateCategoryValidator),
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(templateVisibilityValidator),
    coverMediaExternalId: v.optional(v.union(v.string(), v.null())),
    creditLine: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await requireOwnedTemplate(ctx, args.slug, userId)
    const author = await toTemplateAuthor(ctx, userId)

    const title =
      args.title === undefined
        ? template.title
        : normalizeTemplateTitle(args.title)
    const description =
      args.description === undefined
        ? template.description
        : normalizeDescription(args.description)
    const category = args.category ?? template.category
    const tags =
      args.tags === undefined ? template.tags : normalizeTags(args.tags)
    const creditLine =
      args.creditLine === undefined
        ? template.creditLine
        : normalizeCreditLine(args.creditLine)
    const previousPublic = isPublicTemplateRow(template)
    const nextVisibility = args.visibility ?? template.visibility
    const coverMediaAssetId = await resolveCoverMediaId(
      ctx,
      userId,
      args.coverMediaExternalId,
      template.coverMediaAssetId
    )

    await ctx.db.patch(template._id, {
      title,
      description,
      category,
      tags,
      visibility: nextVisibility,
      coverMediaAssetId,
      creditLine,
      searchText: buildSearchText({
        title,
        description,
        category,
        tags,
        authorDisplayName: author.displayName,
      }),
      updatedAt: Date.now(),
    })
    const nextPublic =
      nextVisibility === 'public' && template.unpublishedAt === null
    // skip the counter round-trip when neither visibility nor category moved.
    // a no-op pair like [{cat:X,-1},{cat:X,+1}] would still issue a write
    const stayedPublicSameCategory =
      previousPublic && nextPublic && template.category === category
    if (!stayedPublicSameCategory)
    {
      const transitions: { category: TemplateCategory; delta: number }[] = []
      if (previousPublic)
      {
        transitions.push({ category: template.category, delta: -1 })
      }
      if (nextPublic)
      {
        transitions.push({ category, delta: 1 })
      }
      await adjustPublicTemplateCount(ctx, transitions)
    }

    const updated = await ctx.db.get(template._id)
    if (updated)
    {
      await syncTemplateTagRows(ctx, updated)
    }

    return null
  },
})

export const unpublishMyTemplate = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return null
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await requireOwnedTemplate(ctx, args.slug, userId)
    if (template.unpublishedAt !== null)
    {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(template._id, {
      unpublishedAt: now,
      updatedAt: now,
    })
    if (isPublicTemplateRow(template))
    {
      await adjustPublicTemplateCount(ctx, [
        { category: template.category, delta: -1 },
      ])
    }
    await patchTemplateTagRows(ctx, template._id, {
      unpublishedAt: now,
      updatedAt: now,
    })

    return null
  },
})

// reverse of unpublishMyTemplate — clears the tombstone & restores the
// template to its stored visibility. counter & tag rows are re-credited only
// when the resulting state is publicly visible
export const republishMyTemplate = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return null
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await requireOwnedTemplate(ctx, args.slug, userId)
    if (template.unpublishedAt === null)
    {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(template._id, {
      unpublishedAt: null,
      updatedAt: now,
    })
    if (template.visibility === 'public')
    {
      await adjustPublicTemplateCount(ctx, [
        { category: template.category, delta: 1 },
      ])
    }
    await patchTemplateTagRows(ctx, template._id, {
      unpublishedAt: null,
      updatedAt: now,
    })

    return null
  },
})

export const useTemplate = mutation({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
    tierSelection: v.optional(templateTierSelectionValidator),
  },
  returns: marketplaceTemplateUseResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateUseResult> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await findTemplateBySlug(ctx, args.slug)
    if (!template || template.unpublishedAt !== null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const templateItems = await loadTemplateItems(ctx, template._id)
    if (templateItems.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'template has no items',
      })
    }

    const tiers = await resolveTemplateTiers(
      ctx,
      userId,
      template,
      args.tierSelection
    )
    const boardExternalId = generateBoardId()
    const now = Date.now()
    const progressCounts = {
      activeItemCount: templateItems.length,
      unrankedItemCount: templateItems.length,
    }
    const boardId = await ctx.db.insert('boards', {
      externalId: boardExternalId,
      ownerId: userId,
      title: normalizeBoardTitle(
        args.title ?? templateTitleToBoardTitle(template.title)
      ),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 0,
      sourceTemplateId: template._id,
      // propagate the template's design-time ratio so per-item transforms
      // (computed in seed against this same ratio) frame correctly. unset
      // values fall back to board defaults (1, auto, cover)
      itemAspectRatio: template.itemAspectRatio ?? undefined,
      itemAspectRatioMode: template.itemAspectRatioMode ?? undefined,
      defaultItemImageFit: template.defaultItemImageFit ?? undefined,
      labels: template.labels ?? undefined,
      ...progressCounts,
      templateProgressState: resolveTemplateProgressState(
        template._id,
        progressCounts
      ),
    })

    await insertBoardTiers(ctx, boardId, tiers)
    await insertBoardItemsFromTemplate(ctx, boardId, userId, templateItems)
    await ctx.db.patch(template._id, { useCount: template.useCount + 1 })

    return { boardExternalId }
  },
})
