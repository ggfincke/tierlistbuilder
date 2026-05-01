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
import { MAX_TEMPLATE_COVER_ITEMS } from '@tierlistbuilder/contracts/marketplace/template'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import { generateUserExternalId } from '@tierlistbuilder/contracts/lib/ids'
import {
  boardLabelSettingsValidator,
  itemTransformValidator,
  templateCategoryValidator,
  tierPresetTiersValidator,
} from '../../lib/validators'
import { base64ToBytes } from '../../lib/base64'
import { parseUploadedImageMetadata } from '../../lib/imageValidation'
import { sha256Hex } from '../../lib/sha256'
import {
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  buildTemplateStateFields,
  DEFAULT_TEMPLATE_TIERS,
  MARKETPLACE_STATS_KEY,
  markTemplateUnpublished,
  patchTemplateAndSyncCard,
  patchTemplateAndSyncCardById,
  syncTemplateCard,
  syncTemplateCardById,
  syncTemplateTagRows,
} from './lib'

// per-item payload sent by scripts/seed-marketplace-templates.ts. aspectRatio
// & transform are pre-computed in the script (sharp + shared scan) so the
// action runs in the V8 runtime w/o native deps
const seedItemValidator = v.object({
  label: v.union(v.string(), v.null()),
  tileBase64: v.string(),
  previewBase64: v.string(),
  aspectRatio: v.union(v.number(), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

interface SeedInputItem
{
  label: string | null
  tileBase64: string
  previewBase64: string
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
  asset: {
    userId: Id<'users'>
    variants: Array<{
      kind: 'tile' | 'preview'
      storageId: Id<'_storage'>
      contentHash: string
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      width: number
      height: number
      byteSize: number
    }>
  }
}

interface SeedUserStatus
{
  accountExists: boolean
}

const SEED_SECRET_ENV = 'CONVEX_SEED_SECRET'

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
      plan: user.plan ?? 'free',
      lastUpsertError: undefined,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
      { authorId: user._id, cursor: null }
    )
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
    const templateState = buildTemplateStateFields(args.items.length, 'public')
    const templateId: Id<'templates'> = await ctx.db.insert('templates', {
      slug,
      authorId: args.authorId,
      title: args.title,
      description: args.description,
      category: args.category,
      tags: args.tags,
      visibility: 'public',
      coverMediaAssetId: null,
      coverItems,
      suggestedTiers: args.suggestedTiers,
      sourceBoardId: null,
      ...templateState,
      itemCount: args.items.length,
      useCount: 0,
      viewCount: 0,
      featuredRank: null,
      creditLine: null,
      // pre-baked design ratio + cover fit — the per-item transforms below
      // were computed against this ratio, so forks must inherit it. mode is
      // 'manual' to pin it; auto-recompute would drift on later edits
      itemAspectRatio: args.itemAspectRatio,
      itemAspectRatioMode: args.itemAspectRatio === null ? 'auto' : 'manual',
      defaultItemImageFit: 'cover',
      labels: args.labels ?? undefined,
      createdAt: now,
      updatedAt: now,
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
      { category: args.category, delta: 1 },
    ])

    await syncTemplateTagRows(ctx, {
      _id: templateId,
      tags: args.tags,
      category: args.category,
      isPubliclyListable: templateState.isPubliclyListable,
      updatedAt: now,
    })
    await syncTemplateCardById(ctx, templateId)

    return { slug }
  },
})

const prepareSeedVariant = async (
  ctx: ActionCtx,
  kind: 'tile' | 'preview',
  contentBase64: string
): Promise<SeedImageUpload['asset']['variants'][number]> =>
{
  const bytes = base64ToBytes(contentBase64)
  const meta = parseUploadedImageMetadata(bytes)
  const contentHash = await sha256Hex(bytes as BufferSource)
  const storageId = await ctx.storage.store(
    new Blob([bytes as BlobPart], { type: meta.mimeType })
  )
  return {
    kind,
    storageId,
    contentHash,
    mimeType: meta.mimeType,
    width: meta.width,
    height: meta.height,
    byteSize: bytes.byteLength,
  }
}

const prepareSeedImageUpload = async (
  ctx: ActionCtx,
  ownerId: Id<'users'>,
  item: SeedInputItem
): Promise<SeedImageUpload> =>
{
  const variants = await Promise.all([
    prepareSeedVariant(ctx, 'tile', item.tileBase64),
    prepareSeedVariant(ctx, 'preview', item.previewBase64),
  ])
  return {
    label: item.label,
    aspectRatio: item.aspectRatio,
    transform: item.transform,
    asset: {
      userId: ownerId,
      variants,
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
      internal.platform.media.internal.finalizeVerifiedMediaAssets,
      { assets: uploads.map((item) => item.asset) }
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

const requireSeedAuthorized = (seedSecret: string): void =>
{
  if (process.env.CONVEX_SEED_ENABLED !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message:
        'seeding is disabled — set CONVEX_SEED_ENABLED=true on this deployment to allow it',
    })
  }

  const expectedSecret = process.env.CONVEX_SEED_SECRET
  if (!expectedSecret || seedSecret !== expectedSecret)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is locked — pass the deployment ${SEED_SECRET_ENV} value`,
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
    await patchTemplateAndSyncCard(ctx, template, {
      featuredRank: args.featuredRank,
    })
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
    const rankedCards = ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableFeaturedRank', (q) =>
        q.eq('isPubliclyListable', true).gt('featuredRank', -1)
      )

    for await (const card of rankedCards)
    {
      rankedTemplateIds.push(card.templateId)
    }

    await Promise.all(
      rankedTemplateIds.map(async (templateId) =>
      {
        await patchTemplateAndSyncCardById(ctx, templateId, {
          featuredRank: null,
        })
      })
    )
    return {
      cleared: rankedTemplateIds.length,
      scanned: rankedTemplateIds.length,
    }
  },
})

export const promoteFeatured = action({
  args: {
    seedSecret: v.string(),
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
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.setTemplateFeaturedRank,
      { slug: args.slug, featuredRank: args.featuredRank }
    )
  },
})

export const clearAllFeaturedRanks = action({
  args: { seedSecret: v.string() },
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx, args): Promise<{ cleared: number; scanned: number }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.clearAllFeaturedRanksImpl,
      {}
    )
  },
})

export const getSeedUserStatus = action({
  args: { seedSecret: v.string(), email: v.string() },
  returns: v.object({ accountExists: v.boolean() }),
  handler: async (ctx, args): Promise<SeedUserStatus> =>
  {
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runQuery(
      internal.marketplace.templates.seed.getSeedUserStatusImpl,
      { email: args.email }
    )
  },
})

export const patchSeedUserProfile = action({
  args: {
    seedSecret: v.string(),
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
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.patchSeedUserProfileImpl,
      { email: args.email, displayName: args.displayName }
    )
  },
})

// dev-only — rebuild marketplaceStats counters from current card rows.
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
    const publicCards = ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableUpdatedAt', (q) =>
        q.eq('isPubliclyListable', true)
      )
    for await (const card of publicCards)
    {
      count += 1
      countByCategory[card.category] = (countByCategory[card.category] ?? 0) + 1
    }

    const stats = await ctx.db
      .query('marketplaceStats')
      .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
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
        key: MARKETPLACE_STATS_KEY,
        publicTemplateCount: count,
        publicTemplateCountByCategory: countByCategory,
        updatedAt: now,
      })
    }
    return { count, countByCategory }
  },
})

export const recomputeMarketplaceStats = action({
  args: { seedSecret: v.string() },
  returns: v.object({
    count: v.number(),
    countByCategory: v.record(v.string(), v.number()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ count: number; countByCategory: Record<string, number> }> =>
  {
    requireSeedAuthorized(args.seedSecret)
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
        await syncTemplateTagRows(ctx, template)
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
  args: { seedSecret: v.string() },
  returns: v.object({
    templatesScanned: v.number(),
    tagsInserted: v.number(),
    tagsDeleted: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    templatesScanned: number
    tagsInserted: number
    tagsDeleted: number
  }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.recomputeTemplateTagsImpl,
      {}
    )
  },
})

export const recomputeTemplateCardsImpl = internalMutation({
  args: {},
  returns: v.object({
    templatesScanned: v.number(),
    cardsDeleted: v.number(),
  }),
  handler: async (
    ctx
  ): Promise<{ templatesScanned: number; cardsDeleted: number }> =>
  {
    const templates = await ctx.db.query('templates').collect()
    const liveTemplateIds = new Set(templates.map((template) => template._id))
    const cards = await ctx.db.query('templateCards').collect()
    const staleCards = cards.filter(
      (card) => !liveTemplateIds.has(card.templateId)
    )

    await Promise.all(staleCards.map((card) => ctx.db.delete(card._id)))
    await Promise.all(
      templates.map((template) => syncTemplateCard(ctx, template))
    )

    return {
      templatesScanned: templates.length,
      cardsDeleted: staleCards.length,
    }
  },
})

export const recomputeTemplateCards = action({
  args: { seedSecret: v.string() },
  returns: v.object({
    templatesScanned: v.number(),
    cardsDeleted: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ templatesScanned: number; cardsDeleted: number }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.recomputeTemplateCardsImpl,
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
      toClear.map(async ([template]) =>
      {
        await patchTemplateAndSyncCard(ctx, template, {
          coverMediaAssetId: null,
        })
      })
    )
    return { cleared: toClear.length, scanned: templates.length }
  },
})

// dev-only — wipe ALL templates, templateItems, templateTags, marketplaceStats,
// templateCards, & forked boards. skips users, sessions, & identity tables
export const wipeAllSeededDataImpl = internalMutation({
  args: {},
  returns: v.object({
    templates: v.number(),
    templateCards: v.number(),
    templateItems: v.number(),
    templateTags: v.number(),
    forkedBoards: v.number(),
  }),
  handler: async (ctx) =>
  {
    const templates = await ctx.db.query('templates').collect()
    const templateCards = await ctx.db.query('templateCards').collect()
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
    await Promise.all([
      ...templateCards.map((card) => ctx.db.delete(card._id)),
      ...templateRows.flatMap(({ template, items, tags }) => [
        ...items.map((item) => ctx.db.delete(item._id)),
        ...tags.map((tag) => ctx.db.delete(tag._id)),
        ctx.db.delete(template._id),
      ]),
    ])

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
      .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
      .unique()
    if (stats) await ctx.db.delete(stats._id)

    return {
      templates: templates.length,
      templateCards: templateCards.length,
      templateItems,
      templateTags,
      forkedBoards: forkedBoardRows.length,
    }
  },
})

interface WipeResult
{
  templates: number
  templateCards: number
  templateItems: number
  templateTags: number
  forkedBoards: number
}

export const wipeAllSeededData = action({
  args: { seedSecret: v.string() },
  returns: v.object({
    templates: v.number(),
    templateCards: v.number(),
    templateItems: v.number(),
    templateTags: v.number(),
    forkedBoards: v.number(),
  }),
  handler: async (ctx, args): Promise<WipeResult> =>
  {
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.wipeAllSeededDataImpl,
      {}
    )
  },
})

// soft-delete a single seeded template by slug & update public read models.
// lets the seed script re-publish a folder w/o leaving the prior copy visible
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
    if (template.publicationState === 'unpublished')
    {
      return { found: true, alreadyUnpublished: true }
    }

    const now = Date.now()
    await markTemplateUnpublished(ctx, template, now)
    return { found: true, alreadyUnpublished: false }
  },
})

export const unpublishSeededTemplate = action({
  args: { seedSecret: v.string(), slug: v.string() },
  returns: v.object({
    found: v.boolean(),
    alreadyUnpublished: v.boolean(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ found: boolean; alreadyUnpublished: boolean }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    return await ctx.runMutation(
      internal.marketplace.templates.seed.unpublishSeededTemplateImpl,
      { slug: args.slug }
    )
  },
})

export const clearSeededCovers = action({
  args: { seedSecret: v.string() },
  returns: v.object({ cleared: v.number(), scanned: v.number() }),
  handler: async (ctx, args): Promise<{ cleared: number; scanned: number }> =>
  {
    requireSeedAuthorized(args.seedSecret)
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

    const now = Date.now()
    const templatePatch = {
      itemCount: args.itemCount,
      coverItems,
      ...buildTemplateStateFields(
        args.itemCount,
        template.visibility,
        template.publicationState
      ),
      updatedAt: now,
    }
    await patchTemplateAndSyncCard(ctx, template, templatePatch)
    return { totalItems: args.itemCount }
  },
})

// dev-only — invoked from scripts/seed-marketplace-templates.ts via the
// http client. gated by CONVEX_SEED_ENABLED + CONVEX_SEED_SECRET.
// resolves author by email, stores all images, inserts template + items
export const seedTemplateFromBlobs = action({
  args: {
    seedSecret: v.string(),
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
    requireSeedAuthorized(args.seedSecret)
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
// through this action. same seed-secret gate
export const appendItemsToSeededTemplateBlobs = action({
  args: {
    seedSecret: v.string(),
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
    requireSeedAuthorized(args.seedSecret)
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
    seedSecret: v.string(),
    authorEmail: v.string(),
    slug: v.string(),
    itemCount: v.number(),
  },
  returns: v.object({ totalItems: v.number() }),
  handler: async (ctx, args): Promise<{ totalItems: number }> =>
  {
    requireSeedAuthorized(args.seedSecret)
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
