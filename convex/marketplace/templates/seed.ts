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
import {
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
  toTemplateAuthor,
} from './lib'

const seedItemValidator = v.object({
  label: v.union(v.string(), v.null()),
  contentBase64: v.string(),
})

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

export const insertSeedTemplate = internalMutation({
  args: {
    authorId: v.id('users'),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    suggestedTiers: tierPresetTiersValidator,
    items: v.array(
      v.object({
        label: v.union(v.string(), v.null()),
        mediaAssetId: v.id('mediaAssets'),
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
          aspectRatio: null,
          imageFit: null,
          transform: null,
        })
      )
    )
    await adjustPublicTemplateCount(ctx, 1)

    return { slug }
  },
})

const storeSeedImage = async (
  ctx: ActionCtx,
  ownerId: Id<'users'>,
  contentBase64: string
): Promise<{ mediaAssetId: Id<'mediaAssets'> }> =>
{
  const bytes = decodeBase64(contentBase64)
  const meta = parseUploadedImageMetadata(bytes)
  const contentHash = await sha256Hex(bytes as BufferSource)
  // intentionally drop the { sha256 } integrity option — the seed loop trips
  // a Node "invalid HTTP header" inside the storage syscall when set; seed is
  // dev-only & we still verify the hash ourselves in finalizeVerifiedUpload
  const storageId = await ctx.storage.store(
    new Blob([bytes as BlobPart], { type: meta.mimeType })
  )
  const { mediaAssetId } = await ctx.runMutation(
    internal.platform.media.internal.finalizeVerifiedUpload,
    {
      userId: ownerId,
      storageId,
      contentHash,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height,
      byteSize: bytes.byteLength,
    }
  )
  return { mediaAssetId }
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

// dev-only — strip the implicit single-image cover off seeded templates so
// the gallery falls back to the item-grid Mosaic. detects seeded rows by the
// `seed-` externalId prefix on their first templateItem
export const clearSeededTemplateCovers = internalMutation({
  args: {},
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ cleared: number; scanned: number }> =>
  {
    const templates = await ctx.db.query('templates').collect()
    let cleared = 0
    for (const template of templates)
    {
      if (template.coverMediaAssetId === null) continue
      const firstItem = await ctx.db
        .query('templateItems')
        .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
        .first()
      if (!firstItem || !firstItem.externalId.startsWith('seed-')) continue
      await ctx.db.patch(template._id, { coverMediaAssetId: null })
      cleared += 1
    }
    return { cleared, scanned: templates.length }
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
// a folder's payload exceeds the action body limit & must be chunked. extends
// coverItems if it isn't full yet so the chunk-1 cover stays representative
export const appendItemsToSeededTemplate = internalMutation({
  args: {
    slug: v.string(),
    items: v.array(
      v.object({
        label: v.union(v.string(), v.null()),
        mediaAssetId: v.id('mediaAssets'),
      })
    ),
  },
  returns: v.object({ totalItems: v.number() }),
  handler: async (ctx, args): Promise<{ totalItems: number }> =>
  {
    if (args.items.length === 0)
    {
      return { totalItems: 0 }
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

    const startOrder = template.itemCount
    await Promise.all(
      args.items.map((item, i) =>
        ctx.db.insert('templateItems', {
          templateId: template._id,
          externalId: `seed-${args.slug}-${(startOrder + i).toString().padStart(4, '0')}`,
          label: item.label,
          backgroundColor: null,
          altText: item.label,
          mediaAssetId: item.mediaAssetId,
          order: startOrder + i,
          aspectRatio: null,
          imageFit: null,
          transform: null,
        })
      )
    )

    const coverRoom = MAX_TEMPLATE_COVER_ITEMS - template.coverItems.length
    const extendedCoverItems =
      coverRoom > 0
        ? [
            ...template.coverItems,
            ...args.items.slice(0, coverRoom).map((item) => ({
              mediaAssetId: item.mediaAssetId,
              label: item.label ?? null,
            })),
          ]
        : template.coverItems

    const totalItems = template.itemCount + args.items.length
    await ctx.db.patch(template._id, {
      itemCount: totalItems,
      coverItems: extendedCoverItems,
      updatedAt: Date.now(),
    })

    return { totalItems }
  },
})

// dev-only — invoked from scripts/seed-marketplace-templates.mjs via the
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

    const stored = await Promise.all(
      args.items.map(async (item) =>
      {
        const { mediaAssetId } = await storeSeedImage(
          ctx,
          author._id,
          item.contentBase64
        )
        return { label: item.label, mediaAssetId }
      })
    )

    const result: SeedInsertResult = await ctx.runMutation(
      internal.marketplace.templates.seed.insertSeedTemplate,
      {
        authorId: author._id,
        title: args.title,
        description: args.description,
        category: args.category,
        tags: args.tags,
        suggestedTiers: args.suggestedTiers ?? [...DEFAULT_TEMPLATE_TIERS],
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

    const stored = await Promise.all(
      args.items.map(async (item) =>
      {
        const { mediaAssetId } = await storeSeedImage(
          ctx,
          author._id,
          item.contentBase64
        )
        return { label: item.label, mediaAssetId }
      })
    )

    const result: { totalItems: number } = await ctx.runMutation(
      internal.marketplace.templates.seed.appendItemsToSeededTemplate,
      {
        slug: args.slug,
        items: stored,
      }
    )

    return { itemsAppended: stored.length, totalItems: result.totalItems }
  },
})
