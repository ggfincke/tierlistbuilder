// convex/marketplace/templates/seed.ts
// dev-only seeding for the templates marketplace. takes raw image bytes &
// item labels, stores blobs, then inserts a fully-formed template

import { ConvexError, v } from 'convex/values'
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  MAX_TEMPLATE_COVER_ITEMS,
  type TemplateCategory,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import { generateUserExternalId } from '@tierlistbuilder/contracts/lib/ids'
import {
  boardLabelSettingsValidator,
  itemTransformValidator,
  templateCategoryValidator,
  tierPresetTiersValidator,
} from '../../lib/validators'
import { parseUploadedImageMetadata } from '../../lib/imageValidation'
import { sha256Hex } from '../../lib/sha256'
import {
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  buildSearchText,
  DEFAULT_TEMPLATE_TIERS,
  isPublicTemplateRow,
  patchTemplateTagRows,
  syncTemplateTagRows,
  toTemplateAuthor,
} from './lib'

// per-item payload sent by scripts/seed-marketplace-templates.ts. aspectRatio
// & transform are pre-computed in the script (sharp + shared scan) so the
// action runs in the V8 runtime w/o native deps
const seedItemValidator = v.object({
  label: v.union(v.string(), v.null()),
  contentBase64: v.string(),
  aspectRatio: v.union(v.number(), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

interface SeedInputItem
{
  label: string | null
  contentBase64: string
  aspectRatio: number | null
  transform: ItemTransform | null
}

interface SeedStoredItem
{
  label: string | null
  mediaAssetId: Id<'mediaAssets'>
  aspectRatio: number | null
  transform: ItemTransform | null
}

interface SeedImageUpload
{
  label: string | null
  aspectRatio: number | null
  transform: ItemTransform | null
  upload: {
    userId: Id<'users'>
    storageId: Id<'_storage'>
    contentHash: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    width: number
    height: number
    byteSize: number
  }
}

interface SeedUserStatus
{
  accountExists: boolean
}

const decodeBase64 = (input: string): Uint8Array =>
{
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
  {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.object({ _id: v.id('users'), email: v.union(v.string(), v.null()) }),
    v.null()
  ),
  handler: async (ctx, args) =>
  {
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', args.email))
      .unique()
    if (!user) return null
    return { _id: user._id, email: user.email ?? null }
  },
})

export const getSeedUserStatusImpl = internalQuery({
  args: { email: v.string() },
  returns: v.object({ accountExists: v.boolean() }),
  handler: async (ctx, args): Promise<SeedUserStatus> =>
  {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', args.email)
      )
      .unique()
    return { accountExists: account !== null }
  },
})

export const patchSeedUserProfileImpl = internalMutation({
  args: {
    email: v.string(),
    displayName: v.string(),
  },
  returns: v.object({ found: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{
    found: boolean
  }> =>
  {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', args.email)
      )
      .unique()
    if (!account) return { found: false }

    const user = await ctx.db.get(account.userId)
    if (!user) return { found: false }

    const now = Date.now()
    await ctx.db.patch(user._id, {
      name: args.displayName,
      displayName: args.displayName,
      externalId: user.externalId ?? generateUserExternalId(),
      createdAt: user.createdAt ?? now,
      updatedAt: now,
      tier: user.tier ?? 'free',
      lastUpsertError: undefined,
    })
    return { found: true }
  },
})

export const insertSeedTemplate = internalMutation({
  args: {
    authorId: v.id('users'),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    suggestedTiers: tierPresetTiersValidator,
    // template-level slot ratio chosen by the script (snap to nearest preset
    // of the per-item majority). null when no items had usable dimensions —
    // forks then fall back to the board default (1, square)
    itemAspectRatio: v.union(v.number(), v.null()),
    // pre-baked board label settings; forks copy this onto the new board so
    // the publisher's caption styling shows up without each user toggling
    labels: v.union(boardLabelSettingsValidator, v.null()),
    items: v.array(
      v.object({
        label: v.union(v.string(), v.null()),
        mediaAssetId: v.id('mediaAssets'),
        aspectRatio: v.union(v.number(), v.null()),
        transform: v.union(itemTransformValidator, v.null()),
      })
    ),
  },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, args) =>
  {
    if (args.items.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: 'cannot seed an empty template',
      })
    }

    const author: Doc<'users'> | null = await ctx.db.get(args.authorId)
    if (!author)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed author user not found: ${args.authorId}`,
      })
    }

    const authorProjection = await toTemplateAuthor(ctx, author._id)
    const coverItems = args.items
      .slice(0, MAX_TEMPLATE_COVER_ITEMS)
      .map((item) => ({
        mediaAssetId: item.mediaAssetId,
        label: item.label ?? null,
      }))

    // leave coverMediaAssetId null so the gallery renders the item-image
    // grid (Mosaic). a publisher who later wants a single banner can patch
    // it via the publish/edit flow
    const now = Date.now()
    const slug = await allocateTemplateSlug(ctx)
    const templateId: Id<'templates'> = await ctx.db.insert('templates', {
      slug,
      authorId: args.authorId,
      title: args.title,
      description: args.description,
      category: args.category as TemplateCategory,
      tags: args.tags,
      visibility: 'public',
      coverMediaAssetId: null,
      coverItems,
      suggestedTiers: args.suggestedTiers,
      sourceBoardExternalId: null,
      itemCount: args.items.length,
      useCount: 0,
      viewCount: 0,
      featuredRank: null,
      creditLine: null,
      searchText: buildSearchText({
        title: args.title,
        description: args.description,
        category: args.category as TemplateCategory,
        tags: args.tags,
        authorDisplayName: authorProjection.displayName,
      }),
      // pre-baked design ratio + cover fit — the per-item transforms below
      // were computed against this ratio, so forks must inherit it. mode is
      // 'manual' to pin it; auto-recompute would drift on later edits
      itemAspectRatio: args.itemAspectRatio,
      itemAspectRatioMode: args.itemAspectRatio === null ? 'auto' : 'manual',
      defaultItemImageFit: 'cover',
      labels: args.labels ?? undefined,
      createdAt: now,
      updatedAt: now,
      unpublishedAt: null,
    })

    await Promise.all(
      args.items.map((item, order) =>
        ctx.db.insert('templateItems', {
          templateId,
          externalId: `seed-${slug}-${order.toString().padStart(4, '0')}`,
          label: item.label,
          backgroundColor: null,
          altText: item.label,
          mediaAssetId: item.mediaAssetId,
          order,
          aspectRatio: item.aspectRatio,
          imageFit: null,
          transform: item.transform,
        })
      )
    )
    await adjustPublicTemplateCount(ctx, [
      { category: args.category as TemplateCategory, delta: 1 },
    ])

    const inserted = await ctx.db.get(templateId)
    if (inserted)
    {
      await syncTemplateTagRows(ctx, inserted)
    }

    return { slug }
  },
})

const prepareSeedImageUpload = async (
  ctx: ActionCtx,
  ownerId: Id<'users'>,
  item: SeedInputItem
): Promise<SeedImageUpload> =>
{
  const bytes = decodeBase64(item.contentBase64)
  const meta = parseUploadedImageMetadata(bytes)
  const contentHash = await sha256Hex(bytes as BufferSource)
  // intentionally drop the { sha256 } integrity option — the seed loop trips
  // a Node "invalid HTTP header" inside the storage syscall when set; seed is
  // dev-only & we still verify the hash ourselves in finalizeVerifiedUpload
  const storageId = await ctx.storage.store(
    new Blob([bytes as BlobPart], { type: meta.mimeType })
  )
  return {
    label: item.label,
    aspectRatio: item.aspectRatio,
    transform: item.transform,
    upload: {
      userId: ownerId,
      storageId,
      contentHash,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height,
      byteSize: bytes.byteLength,
    },
  }
}

const storeSeedImages = async (
  ctx: ActionCtx,
  ownerId: Id<'users'>,
  items: readonly SeedInputItem[]
): Promise<SeedStoredItem[]> =>
{
  const uploads = await Promise.all(
    items.map((item) => prepareSeedImageUpload(ctx, ownerId, item))
  )
  const finalized: { mediaAssetId: Id<'mediaAssets'> }[] =
    await ctx.runMutation(
      internal.platform.media.internal.finalizeVerifiedUploads,
      { uploads: uploads.map((item) => item.upload) }
    )
  return uploads.map((item, index) => ({
    label: item.label,
    mediaAssetId: finalized[index].mediaAssetId,
    aspectRatio: item.aspectRatio,
    transform: item.transform,
  }))
}

interface SeedAuthor
{
  _id: Id<'users'>
  email: string | null
}

interface SeedInsertResult
{
  slug: string
}

const requireSeedEnabled = (): void =>
{
  if (process.env.CONVEX_SEED_ENABLED !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message:
        'seeding is disabled — set CONVEX_SEED_ENABLED=true on this deployment to allow it',
    })
  }
}

// dev-only — set the featuredRank on a single template by slug. rank=null
// removes it from the featured rail. used by scripts to curate the homepage
// hero/trending/curated trio w/o a re-seed
export const setTemplateFeaturedRank = internalMutation({
  args: {
    slug: v.string(),
    featuredRank: v.union(v.number(), v.null()),
  },
  returns: v.object({
    slug: v.string(),
    featuredRank: v.union(v.number(), v.null()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ slug: string; featuredRank: number | null }> =>
  {
    const template = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()
    if (!template)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `template not found by slug: ${args.slug}`,
      })
    }
    await ctx.db.patch(template._id, { featuredRank: args.featuredRank })
    return { slug: args.slug, featuredRank: args.featuredRank }
  },
})

// dev-only: reset homepage curation before assigning a new trio
export const clearAllFeaturedRanksImpl = internalMutation({
  args: {},
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ cleared: number; scanned: number }> =>
  {
    const rankedTemplateIds: Id<'templates'>[] = []
    const rankedTemplates = ctx.db
      .query('templates')
      .withIndex('byVisibilityUnpublishedFeaturedRank', (q) =>
        q
          .eq('visibility', 'public')
          .eq('unpublishedAt', null)
          .gt('featuredRank', -1)
      )

    for await (const template of rankedTemplates)
    {
      rankedTemplateIds.push(template._id)
    }

    await Promise.all(
      rankedTemplateIds.map((templateId) =>
        ctx.db.patch(templateId, { featuredRank: null })
      )
    )
    return {
      cleared: rankedTemplateIds.length,
      scanned: rankedTemplateIds.length,
    }
  },
})

export const promoteFeatured = action({
  args: {
    slug: v.string(),
    featuredRank: v.union(v.number(), v.null()),
  },
  returns: v.object({
    slug: v.string(),
    featuredRank: v.union(v.number(), v.null()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ slug: string; featuredRank: number | null }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.setTemplateFeaturedRank,
      { slug: args.slug, featuredRank: args.featuredRank }
    )
  },
})

export const clearAllFeaturedRanks = action({
  args: {},
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ cleared: number; scanned: number }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.clearAllFeaturedRanksImpl,
      {}
    )
  },
})

export const getSeedUserStatus = action({
  args: { email: v.string() },
  returns: v.object({ accountExists: v.boolean() }),
  handler: async (ctx, args): Promise<SeedUserStatus> =>
  {
    requireSeedEnabled()
    return await ctx.runQuery(
      internal.marketplace.templates.seed.getSeedUserStatusImpl,
      args
    )
  },
})

export const patchSeedUserProfile = action({
  args: {
    email: v.string(),
    displayName: v.string(),
  },
  returns: v.object({ found: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{
    found: boolean
  }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.patchSeedUserProfileImpl,
      args
    )
  },
})

// dev-only — rebuild marketplaceStats counters from current template rows.
// run after introducing the per-category breakdown so the existing dataset
// reflects in the gallery chips & the "By category" rail without a re-seed
export const recomputeMarketplaceStatsImpl = internalMutation({
  args: {},
  returns: v.object({
    count: v.number(),
    countByCategory: v.record(v.string(), v.number()),
  }),
  handler: async (
    ctx
  ): Promise<{ count: number; countByCategory: Record<string, number> }> =>
  {
    const countByCategory: Record<string, number> = {}
    let count = 0
    for await (const template of ctx.db.query('templates'))
    {
      if (template.visibility !== 'public' || template.unpublishedAt !== null)
      {
        continue
      }
      count += 1
      countByCategory[template.category] =
        (countByCategory[template.category] ?? 0) + 1
    }

    const stats = await ctx.db
      .query('marketplaceStats')
      .withIndex('byKey', (q) => q.eq('key', 'templates'))
      .unique()
    const now = Date.now()
    if (stats)
    {
      await ctx.db.patch(stats._id, {
        publicTemplateCount: count,
        publicTemplateCountByCategory: countByCategory,
        updatedAt: now,
      })
    }
    else
    {
      await ctx.db.insert('marketplaceStats', {
        key: 'templates',
        publicTemplateCount: count,
        publicTemplateCountByCategory: countByCategory,
        updatedAt: now,
      })
    }
    return { count, countByCategory }
  },
})

export const recomputeMarketplaceStats = action({
  args: {},
  returns: v.object({
    count: v.number(),
    countByCategory: v.record(v.string(), v.number()),
  }),
  handler: async (
    ctx
  ): Promise<{ count: number; countByCategory: Record<string, number> }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.recomputeMarketplaceStatsImpl,
      {}
    )
  },
})

// dev-only — rebuild templateTags rows from current template tags. run after
// introducing the normalized tag table so tag filtering picks up rows that
// pre-date the helper hookup
export const recomputeTemplateTagsImpl = internalMutation({
  args: {},
  returns: v.object({
    templatesScanned: v.number(),
    tagsInserted: v.number(),
    tagsDeleted: v.number(),
  }),
  handler: async (
    ctx
  ): Promise<{
    templatesScanned: number
    tagsInserted: number
    tagsDeleted: number
  }> =>
  {
    const templates = await ctx.db.query('templates').collect()
    const results = await Promise.all(
      templates.map(async (template) =>
      {
        const existing = await ctx.db
          .query('templateTags')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .collect()
        await Promise.all(existing.map((row) => ctx.db.delete(row._id)))
        await Promise.all(
          template.tags.map((tag) =>
            ctx.db.insert('templateTags', {
              templateId: template._id,
              tag,
              category: template.category,
              visibility: template.visibility,
              unpublishedAt: template.unpublishedAt,
              updatedAt: template.updatedAt,
            })
          )
        )
        return {
          tagsDeleted: existing.length,
          tagsInserted: template.tags.length,
        }
      })
    )
    return {
      templatesScanned: templates.length,
      tagsInserted: results.reduce(
        (sum, result) => sum + result.tagsInserted,
        0
      ),
      tagsDeleted: results.reduce((sum, result) => sum + result.tagsDeleted, 0),
    }
  },
})

export const recomputeTemplateTags = action({
  args: {},
  returns: v.object({
    templatesScanned: v.number(),
    tagsInserted: v.number(),
    tagsDeleted: v.number(),
  }),
  handler: async (
    ctx
  ): Promise<{
    templatesScanned: number
    tagsInserted: number
    tagsDeleted: number
  }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.recomputeTemplateTagsImpl,
      {}
    )
  },
})

// dev-only — strip the implicit single-image cover off seeded templates so
// the gallery falls back to the item-grid Mosaic. detects seeded rows by the
// `seed-` externalId prefix on their first templateItem
export const clearSeededTemplateCovers = internalMutation({
  args: {},
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ cleared: number; scanned: number }> =>
  {
    const templates = await ctx.db.query('templates').collect()
    const candidates = templates.filter(
      (template) => template.coverMediaAssetId !== null
    )
    const firstItemEntries = await Promise.all(
      candidates.map(async (template) =>
      {
        const firstItem = await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .first()
        return [template, firstItem] as const
      })
    )
    const toClear = firstItemEntries.filter(
      ([, firstItem]) => firstItem?.externalId.startsWith('seed-') === true
    )
    await Promise.all(
      toClear.map(([template]) =>
        ctx.db.patch(template._id, { coverMediaAssetId: null })
      )
    )
    return { cleared: toClear.length, scanned: templates.length }
  },
})

// dev-only — wipe ALL templates, templateItems, templateTags, marketplaceStats,
// & any boards forked from those templates. used to reset local state when
// the seed shape changes. skips users, sessions, & other identity tables
export const wipeAllSeededDataImpl = internalMutation({
  args: {},
  returns: v.object({
    templates: v.number(),
    templateItems: v.number(),
    templateTags: v.number(),
    forkedBoards: v.number(),
  }),
  handler: async (ctx) =>
  {
    const templates = await ctx.db.query('templates').collect()
    const templateRows = await Promise.all(
      templates.map(async (template) =>
      {
        const [items, tags] = await Promise.all([
          ctx.db
            .query('templateItems')
            .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
            .collect(),
          ctx.db
            .query('templateTags')
            .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
            .collect(),
        ])
        return { template, items, tags }
      })
    )
    const templateItems = templateRows.reduce(
      (sum, row) => sum + row.items.length,
      0
    )
    const templateTags = templateRows.reduce(
      (sum, row) => sum + row.tags.length,
      0
    )
    await Promise.all(
      templateRows.flatMap(({ template, items, tags }) => [
        ...items.map((item) => ctx.db.delete(item._id)),
        ...tags.map((tag) => ctx.db.delete(tag._id)),
        ctx.db.delete(template._id),
      ])
    )

    const boards = await ctx.db.query('boards').collect()
    const forkedBoardRows = await Promise.all(
      boards
        .filter((board) => board.sourceTemplateId !== null)
        .map(async (board) =>
        {
          const [items, tiers] = await Promise.all([
            ctx.db
              .query('boardItems')
              .withIndex('byBoardAndTier', (q) => q.eq('boardId', board._id))
              .collect(),
            ctx.db
              .query('boardTiers')
              .withIndex('byBoard', (q) => q.eq('boardId', board._id))
              .collect(),
          ])
          return { board, items, tiers }
        })
    )
    await Promise.all(
      forkedBoardRows.flatMap(({ board, items, tiers }) => [
        ...items.map((item) => ctx.db.delete(item._id)),
        ...tiers.map((tier) => ctx.db.delete(tier._id)),
        ctx.db.delete(board._id),
      ])
    )

    const stats = await ctx.db
      .query('marketplaceStats')
      .withIndex('byKey', (q) => q.eq('key', 'templates'))
      .unique()
    if (stats) await ctx.db.delete(stats._id)

    return {
      templates: templates.length,
      templateItems,
      templateTags,
      forkedBoards: forkedBoardRows.length,
    }
  },
})

interface WipeResult
{
  templates: number
  templateItems: number
  templateTags: number
  forkedBoards: number
}

export const wipeAllSeededData = action({
  args: {},
  returns: v.object({
    templates: v.number(),
    templateItems: v.number(),
    templateTags: v.number(),
    forkedBoards: v.number(),
  }),
  handler: async (ctx): Promise<WipeResult> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.wipeAllSeededDataImpl,
      {}
    )
  },
})

// soft-delete a single seeded template by slug (sets unpublishedAt + decrements
// the public counter + patches tag rows). lets the seed script re-publish a
// folder without leaving the prior copy visible in the marketplace
export const unpublishSeededTemplateImpl = internalMutation({
  args: { slug: v.string() },
  returns: v.object({
    found: v.boolean(),
    alreadyUnpublished: v.boolean(),
  }),
  handler: async (ctx, args) =>
  {
    const template = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()
    if (!template)
    {
      return { found: false, alreadyUnpublished: false }
    }
    if (template.unpublishedAt !== null)
    {
      return { found: true, alreadyUnpublished: true }
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
    return { found: true, alreadyUnpublished: false }
  },
})

export const unpublishSeededTemplate = action({
  args: { slug: v.string() },
  returns: v.object({
    found: v.boolean(),
    alreadyUnpublished: v.boolean(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ found: boolean; alreadyUnpublished: boolean }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.unpublishSeededTemplateImpl,
      { slug: args.slug }
    )
  },
})

export const clearSeededCovers = action({
  args: {},
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ cleared: number; scanned: number }> =>
  {
    requireSeedEnabled()
    return await ctx.runMutation(
      internal.marketplace.templates.seed.clearSeededTemplateCovers,
      {}
    )
  },
})

// append items to a previously-seeded template. used by the seed script when
// a folder's payload exceeds the action body limit & must be chunked. startOrder
// lets chunk appends run in parallel while preserving final item order
export const appendItemsToSeededTemplate = internalMutation({
  args: {
    slug: v.string(),
    startOrder: v.number(),
    items: v.array(
      v.object({
        label: v.union(v.string(), v.null()),
        mediaAssetId: v.id('mediaAssets'),
        aspectRatio: v.union(v.number(), v.null()),
        transform: v.union(itemTransformValidator, v.null()),
      })
    ),
  },
  returns: v.object({ totalItems: v.number() }),
  handler: async (ctx, args): Promise<{ totalItems: number }> =>
  {
    if (args.items.length === 0)
    {
      return { totalItems: args.startOrder }
    }

    const template = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()
    if (!template)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seeded template not found by slug: ${args.slug}`,
      })
    }

    await Promise.all(
      args.items.map((item, i) =>
        ctx.db.insert('templateItems', {
          templateId: template._id,
          externalId: `seed-${args.slug}-${(args.startOrder + i).toString().padStart(4, '0')}`,
          label: item.label,
          backgroundColor: null,
          altText: item.label,
          mediaAssetId: item.mediaAssetId,
          order: args.startOrder + i,
          aspectRatio: item.aspectRatio,
          imageFit: null,
          transform: item.transform,
        })
      )
    )

    const totalItems = args.startOrder + args.items.length
    return { totalItems }
  },
})

export const finalizeSeededTemplateChunksImpl = internalMutation({
  args: {
    slug: v.string(),
    authorId: v.id('users'),
    itemCount: v.number(),
  },
  returns: v.object({ totalItems: v.number() }),
  handler: async (ctx, args): Promise<{ totalItems: number }> =>
  {
    const template = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()
    if (!template || template.authorId !== args.authorId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seeded template not found by slug: ${args.slug}`,
      })
    }

    const coverItemRows = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
      .take(MAX_TEMPLATE_COVER_ITEMS)
    const coverItems = coverItemRows
      .filter(
        (item): item is typeof item & { mediaAssetId: Id<'mediaAssets'> } =>
          item.mediaAssetId !== null
      )
      .map((item) => ({
        mediaAssetId: item.mediaAssetId,
        label: item.label ?? null,
      }))

    await ctx.db.patch(template._id, {
      itemCount: args.itemCount,
      coverItems,
      updatedAt: Date.now(),
    })
    return { totalItems: args.itemCount }
  },
})

// dev-only — invoked from scripts/seed-marketplace-templates.ts via the
// http client. gated behind CONVEX_SEED_ENABLED so prod refuses callers.
// resolves author by email, stores all images, inserts template + items
export const seedTemplateFromBlobs = action({
  args: {
    authorEmail: v.string(),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    suggestedTiers: v.optional(tierPresetTiersValidator),
    // template slot ratio chosen by the script (already snapped to a preset).
    // null only when no items had usable dimensions
    itemAspectRatio: v.union(v.number(), v.null()),
    // optional pre-baked board label settings — forks inherit when present
    labels: v.optional(v.union(boardLabelSettingsValidator, v.null())),
    items: v.array(seedItemValidator),
  },
  returns: v.object({
    slug: v.string(),
    itemsCreated: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ slug: string; itemsCreated: number }> =>
  {
    requireSeedEnabled()
    const author: SeedAuthor | null = await ctx.runQuery(
      internal.marketplace.templates.seed.findUserByEmail,
      { email: args.authorEmail }
    )
    if (!author)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed author not found by email: ${args.authorEmail}. sign up in the app first`,
      })
    }

    const stored = await storeSeedImages(ctx, author._id, args.items)

    const result: SeedInsertResult = await ctx.runMutation(
      internal.marketplace.templates.seed.insertSeedTemplate,
      {
        authorId: author._id,
        title: args.title,
        description: args.description,
        category: args.category,
        tags: args.tags,
        suggestedTiers: args.suggestedTiers ?? [...DEFAULT_TEMPLATE_TIERS],
        itemAspectRatio: args.itemAspectRatio,
        labels: args.labels ?? null,
        items: stored,
      }
    )

    return { slug: result.slug, itemsCreated: stored.length }
  },
})

// chunked-upload sibling of seedTemplateFromBlobs — the script creates the
// template w/ chunk 1, then streams remaining items in size-bounded batches
// through this action. same auth/seed gating
export const appendItemsToSeededTemplateBlobs = action({
  args: {
    authorEmail: v.string(),
    slug: v.string(),
    startOrder: v.number(),
    items: v.array(seedItemValidator),
  },
  returns: v.object({
    itemsAppended: v.number(),
    totalItems: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ itemsAppended: number; totalItems: number }> =>
  {
    requireSeedEnabled()
    const author: SeedAuthor | null = await ctx.runQuery(
      internal.marketplace.templates.seed.findUserByEmail,
      { email: args.authorEmail }
    )
    if (!author)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed author not found by email: ${args.authorEmail}. sign up in the app first`,
      })
    }

    const stored = await storeSeedImages(ctx, author._id, args.items)

    const result: { totalItems: number } = await ctx.runMutation(
      internal.marketplace.templates.seed.appendItemsToSeededTemplate,
      {
        slug: args.slug,
        startOrder: args.startOrder,
        items: stored,
      }
    )

    return { itemsAppended: stored.length, totalItems: result.totalItems }
  },
})

export const finalizeSeededTemplateChunks = action({
  args: {
    authorEmail: v.string(),
    slug: v.string(),
    itemCount: v.number(),
  },
  returns: v.object({ totalItems: v.number() }),
  handler: async (ctx, args): Promise<{ totalItems: number }> =>
  {
    requireSeedEnabled()
    const author: SeedAuthor | null = await ctx.runQuery(
      internal.marketplace.templates.seed.findUserByEmail,
      { email: args.authorEmail }
    )
    if (!author)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed author not found by email: ${args.authorEmail}. sign up in the app first`,
      })
    }

    return await ctx.runMutation(
      internal.marketplace.templates.seed.finalizeSeededTemplateChunksImpl,
      {
        slug: args.slug,
        authorId: author._id,
        itemCount: args.itemCount,
      }
    )
  },
})
