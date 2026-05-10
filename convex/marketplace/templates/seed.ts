// convex/marketplace/templates/seed.ts
// dev-only seeding for the templates marketplace. takes raw image bytes &
// item labels, stores blobs, then inserts a fully-formed template

import { ConvexError, v, type Infer } from 'convex/values'
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
  templateCoverFramingValidator,
  templateCriteriaValidator,
  tierPresetTiersValidator,
} from '../../lib/validators'
import { base64ToBytes } from '../../lib/base64'
import { parseUploadedImageMetadata } from '../../lib/imageValidation'
import { sha256Hex } from '../../lib/sha256'
import {
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  buildTemplateStateFields,
  createTemplateStats,
  DEFAULT_TEMPLATE_TIERS,
  findTemplateCardByTemplateId,
  findTemplateStatsByTemplateId,
  MARKETPLACE_STATS_KEY,
  markTemplateUnpublished,
  patchTemplateAndSyncCard,
  patchTemplateAndSyncCardById,
  requireTemplateStats,
  syncTemplateTagRows,
  writeTemplateCard,
} from './lib'
import {
  buildDefaultTemplateCriteria,
  validateTemplateCriteria,
} from './criteria'

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

const seedCoverImageValidator = v.object({
  tileBase64: v.string(),
  previewBase64: v.string(),
})

interface SeedInputItem
{
  label: string | null
  tileBase64: string
  previewBase64: string
  aspectRatio: number | null
  transform: ItemTransform | null
}

interface SeedInputCoverImage
{
  tileBase64: string
  previewBase64: string
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
    coverMediaAssetId: v.union(v.id('mediaAssets'), v.null()),
    coverFraming: v.optional(v.union(templateCoverFramingValidator, v.null())),
    suggestedTiers: tierPresetTiersValidator,
    criteria: v.optional(templateCriteriaValidator),
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
        backgroundColor: null,
        aspectRatio: item.aspectRatio,
        imageFit: null,
        transform: item.transform,
      }))

    const now = Date.now()
    const slug = await allocateTemplateSlug(ctx)
    const templateState = buildTemplateStateFields(args.items.length, 'public')
    const criteria = validateTemplateCriteria(
      args.criteria ?? buildDefaultTemplateCriteria()
    )
    const templateFields = {
      slug,
      authorId: args.authorId,
      title: args.title,
      description: args.description,
      category: args.category,
      tags: args.tags,
      visibility: 'public',
      coverMediaAssetId: args.coverMediaAssetId,
      coverFraming: args.coverFraming ?? null,
      coverItems,
      suggestedTiers: args.suggestedTiers,
      criteria,
      sourceBoardId: null,
      ...templateState,
      itemCount: args.items.length,
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
    } satisfies Omit<Doc<'templates'>, '_id' | '_creationTime'>
    const templateId: Id<'templates'> = await ctx.db.insert(
      'templates',
      templateFields
    )
    const stats = await createTemplateStats(ctx, templateId, now)

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
    await writeTemplateCard(ctx, { _id: templateId, ...templateFields }, stats)

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

const prepareSeedCoverImageUpload = async (
  ctx: ActionCtx,
  ownerId: Id<'users'>,
  cover: SeedInputCoverImage
): Promise<SeedImageUpload['asset']> =>
{
  const variants = await Promise.all([
    prepareSeedVariant(ctx, 'tile', cover.tileBase64),
    prepareSeedVariant(ctx, 'preview', cover.previewBase64),
  ])
  return {
    userId: ownerId,
    variants,
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

const storeSeedCoverImage = async (
  ctx: ActionCtx,
  ownerId: Id<'users'>,
  cover: SeedInputCoverImage | undefined
): Promise<Id<'mediaAssets'> | null> =>
{
  if (!cover) return null
  const asset = await prepareSeedCoverImageUpload(ctx, ownerId, cover)
  const finalized: { mediaAssetId: Id<'mediaAssets'> }[] =
    await ctx.runMutation(
      internal.platform.media.internal.finalizeVerifiedMediaAssets,
      { assets: [asset] }
    )
  const first = finalized[0]
  if (!first)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'cover image finalization returned no asset',
    })
  }
  return first.mediaAssetId
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

export const setTemplateCriteriaImpl = internalMutation({
  args: {
    slug: v.string(),
    criteria: templateCriteriaValidator,
  },
  returns: v.object({
    slug: v.string(),
    criteria: templateCriteriaValidator,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ slug: string; criteria: Doc<'templates'>['criteria'] }> =>
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

    const nextTemplate = await patchTemplateAndSyncCard(ctx, template, {
      criteria: args.criteria,
      updatedAt: Date.now(),
    })
    return { slug: args.slug, criteria: nextTemplate.criteria }
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

export const setTemplateCriteria = action({
  args: {
    seedSecret: v.string(),
    slug: v.string(),
    criteria: templateCriteriaValidator,
  },
  returns: v.object({
    slug: v.string(),
    criteria: templateCriteriaValidator,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ slug: string; criteria: Doc<'templates'>['criteria'] }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    const result: { slug: string; criteria: Doc<'templates'>['criteria'] } =
      await ctx.runMutation(
        internal.marketplace.templates.seed.setTemplateCriteriaImpl,
        { slug: args.slug, criteria: args.criteria }
      )
    return result
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

const RECOMPUTE_BATCH = 100

// dev-only dashboard action support: rebuild normalized templateTags rows.
export const recomputeTemplateTagsImpl = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    cursor: v.string(),
    isDone: v.boolean(),
    templatesScanned: v.number(),
    tagsInserted: v.number(),
    tagsDeleted: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    cursor: string
    isDone: boolean
    templatesScanned: number
    tagsInserted: number
    tagsDeleted: number
  }> =>
  {
    const page = await ctx.db.query('templates').paginate({
      numItems: RECOMPUTE_BATCH,
      cursor: args.cursor,
    })
    const results = await Promise.all(
      page.page.map((template) => syncTemplateTagRows(ctx, template))
    )
    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      templatesScanned: page.page.length,
      tagsInserted: results.reduce((sum, result) => sum + result.inserted, 0),
      tagsDeleted: results.reduce((sum, result) => sum + result.deleted, 0),
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
    let cursor: string | null = null
    let templatesScanned = 0
    let tagsInserted = 0
    let tagsDeleted = 0
    while (true)
    {
      const result: {
        cursor: string
        isDone: boolean
        templatesScanned: number
        tagsInserted: number
        tagsDeleted: number
      } = await ctx.runMutation(
        internal.marketplace.templates.seed.recomputeTemplateTagsImpl,
        { cursor }
      )
      templatesScanned += result.templatesScanned
      tagsInserted += result.tagsInserted
      tagsDeleted += result.tagsDeleted
      if (result.isDone) break
      cursor = result.cursor
    }
    return { templatesScanned, tagsInserted, tagsDeleted }
  },
})

// dev-only — rebuild templateCards rows for every template; delete stale
// rows whose template was removed. paginated through two phases so a large
// dev dataset doesn't trip the 4096-read mutation cap.
const recomputePhaseValidator = v.union(
  v.literal('cleanStaleCards'),
  v.literal('syncCards')
)

export const recomputeTemplateCardsBatchImpl = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    phase: recomputePhaseValidator,
  },
  returns: v.object({
    cursor: v.string(),
    isDone: v.boolean(),
    cardsDeleted: v.number(),
    templatesScanned: v.number(),
  }),
  handler: async (ctx, args) =>
  {
    if (args.phase === 'cleanStaleCards')
    {
      const page = await ctx.db
        .query('templateCards')
        .paginate({ numItems: RECOMPUTE_BATCH, cursor: args.cursor })
      const stale = await Promise.all(
        page.page.map(async (card) =>
        {
          const template = await ctx.db.get(card.templateId)
          return template ? null : card._id
        })
      )
      const toDelete = stale.filter(
        (id): id is NonNullable<typeof id> => id !== null
      )
      await Promise.all(toDelete.map((id) => ctx.db.delete(id)))
      return {
        cursor: page.continueCursor,
        isDone: page.isDone,
        cardsDeleted: toDelete.length,
        templatesScanned: 0,
      }
    }

    const page = await ctx.db
      .query('templates')
      .paginate({ numItems: RECOMPUTE_BATCH, cursor: args.cursor })
    await Promise.all(
      page.page.map(async (template) =>
      {
        const stats = await requireTemplateStats(ctx, template._id)
        await writeTemplateCard(ctx, template, stats)
      })
    )
    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      cardsDeleted: 0,
      templatesScanned: page.page.length,
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
    let cardsDeleted = 0
    let templatesScanned = 0
    for (const phase of ['cleanStaleCards', 'syncCards'] as const)
    {
      let cursor: string | null = null
      while (true)
      {
        const result: {
          cursor: string
          isDone: boolean
          cardsDeleted: number
          templatesScanned: number
        } = await ctx.runMutation(
          internal.marketplace.templates.seed.recomputeTemplateCardsBatchImpl,
          { cursor, phase }
        )
        cardsDeleted += result.cardsDeleted
        templatesScanned += result.templatesScanned
        if (result.isDone) break
        cursor = result.cursor
      }
    }
    return { templatesScanned, cardsDeleted }
  },
})

// dev-only — paginated batch wipe of seeded marketplace data. keep batches
// below the 4096-read txn cap; action loops phases & skips identity/auth
// tables
const WIPE_BATCH_TEMPLATES = 20
const WIPE_BATCH_BOARDS = 20

const wipePhaseValidator = v.union(
  v.literal('templates'),
  v.literal('forkedBoards'),
  v.literal('marketplaceStats')
)
type WipePhase = Infer<typeof wipePhaseValidator>

export const wipeSeededDataBatchImpl = internalMutation({
  args: { phase: wipePhaseValidator },
  returns: v.object({
    isDone: v.boolean(),
    templatesDeleted: v.number(),
    itemsDeleted: v.number(),
    tagsDeleted: v.number(),
    cardsDeleted: v.number(),
    statsDeleted: v.number(),
    boardsDeleted: v.number(),
    boardItemsDeleted: v.number(),
    boardTiersDeleted: v.number(),
    marketplaceStatsCleared: v.boolean(),
  }),
  handler: async (ctx, args) =>
  {
    if (args.phase === 'templates')
    {
      const templates = await ctx.db
        .query('templates')
        .take(WIPE_BATCH_TEMPLATES)
      const counts = await Promise.all(
        templates.map(async (template) =>
        {
          const [items, tags, card, stats] = await Promise.all([
            ctx.db
              .query('templateItems')
              .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
              .collect(),
            ctx.db
              .query('templateTags')
              .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
              .collect(),
            findTemplateCardByTemplateId(ctx, template._id),
            findTemplateStatsByTemplateId(ctx, template._id),
          ])
          await Promise.all([
            ...items.map((row) => ctx.db.delete(row._id)),
            ...tags.map((row) => ctx.db.delete(row._id)),
            card ? ctx.db.delete(card._id) : Promise.resolve(),
            stats ? ctx.db.delete(stats._id) : Promise.resolve(),
          ])
          await ctx.db.delete(template._id)
          return {
            items: items.length,
            tags: tags.length,
            cards: card ? 1 : 0,
            stats: stats ? 1 : 0,
          }
        })
      )
      return {
        isDone: templates.length < WIPE_BATCH_TEMPLATES,
        templatesDeleted: templates.length,
        itemsDeleted: counts.reduce((sum, c) => sum + c.items, 0),
        tagsDeleted: counts.reduce((sum, c) => sum + c.tags, 0),
        cardsDeleted: counts.reduce((sum, c) => sum + c.cards, 0),
        statsDeleted: counts.reduce((sum, c) => sum + c.stats, 0),
        boardsDeleted: 0,
        boardItemsDeleted: 0,
        boardTiersDeleted: 0,
        marketplaceStatsCleared: false,
      }
    }

    if (args.phase === 'forkedBoards')
    {
      // bySourceTemplate index orders nullable id; non-null entries land in a
      // contiguous range. paginate the index, drop nulls per page, & stop
      // once a page returns fewer than the batch size
      const page = await ctx.db
        .query('boards')
        .withIndex('bySourceTemplate')
        .take(WIPE_BATCH_BOARDS)
      const forked = page.filter((board) => board.sourceTemplateId !== null)
      const counts = await Promise.all(
        forked.map(async (board) =>
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
          await Promise.all([
            ...items.map((row) => ctx.db.delete(row._id)),
            ...tiers.map((row) => ctx.db.delete(row._id)),
          ])
          await ctx.db.delete(board._id)
          return { items: items.length, tiers: tiers.length }
        })
      )
      return {
        isDone: page.length < WIPE_BATCH_BOARDS,
        templatesDeleted: 0,
        itemsDeleted: 0,
        tagsDeleted: 0,
        cardsDeleted: 0,
        statsDeleted: 0,
        boardsDeleted: forked.length,
        boardItemsDeleted: counts.reduce((sum, c) => sum + c.items, 0),
        boardTiersDeleted: counts.reduce((sum, c) => sum + c.tiers, 0),
        marketplaceStatsCleared: false,
      }
    }

    const marketplaceStats = await ctx.db
      .query('marketplaceStats')
      .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
      .unique()
    if (marketplaceStats)
    {
      await ctx.db.delete(marketplaceStats._id)
    }
    return {
      isDone: true,
      templatesDeleted: 0,
      itemsDeleted: 0,
      tagsDeleted: 0,
      cardsDeleted: 0,
      statsDeleted: 0,
      boardsDeleted: 0,
      boardItemsDeleted: 0,
      boardTiersDeleted: 0,
      marketplaceStatsCleared: marketplaceStats !== null,
    }
  },
})

interface WipeBatchResult
{
  templatesDeleted: number
  itemsDeleted: number
  tagsDeleted: number
  cardsDeleted: number
  statsDeleted: number
  boardsDeleted: number
  boardItemsDeleted: number
  boardTiersDeleted: number
  marketplaceStatsCleared: boolean
}

export const wipeSeededDataBatch = action({
  args: { seedSecret: v.string() },
  returns: v.object({
    templatesDeleted: v.number(),
    itemsDeleted: v.number(),
    tagsDeleted: v.number(),
    cardsDeleted: v.number(),
    statsDeleted: v.number(),
    boardsDeleted: v.number(),
    boardItemsDeleted: v.number(),
    boardTiersDeleted: v.number(),
    marketplaceStatsCleared: v.boolean(),
  }),
  handler: async (ctx, args): Promise<WipeBatchResult> =>
  {
    requireSeedAuthorized(args.seedSecret)
    const totals: WipeBatchResult = {
      templatesDeleted: 0,
      itemsDeleted: 0,
      tagsDeleted: 0,
      cardsDeleted: 0,
      statsDeleted: 0,
      boardsDeleted: 0,
      boardItemsDeleted: 0,
      boardTiersDeleted: 0,
      marketplaceStatsCleared: false,
    }
    const phases: WipePhase[] = [
      'templates',
      'forkedBoards',
      'marketplaceStats',
    ]
    for (const phase of phases)
    {
      while (true)
      {
        const result = await ctx.runMutation(
          internal.marketplace.templates.seed.wipeSeededDataBatchImpl,
          { phase }
        )
        totals.templatesDeleted += result.templatesDeleted
        totals.itemsDeleted += result.itemsDeleted
        totals.tagsDeleted += result.tagsDeleted
        totals.cardsDeleted += result.cardsDeleted
        totals.statsDeleted += result.statsDeleted
        totals.boardsDeleted += result.boardsDeleted
        totals.boardItemsDeleted += result.boardItemsDeleted
        totals.boardTiersDeleted += result.boardTiersDeleted
        totals.marketplaceStatsCleared =
          totals.marketplaceStatsCleared || result.marketplaceStatsCleared
        if (result.isDone) break
      }
    }
    return totals
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
        backgroundColor: item.backgroundColor ?? null,
        aspectRatio: item.aspectRatio ?? null,
        imageFit: item.imageFit ?? null,
        transform: item.transform ?? null,
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
    criteria: v.optional(templateCriteriaValidator),
    // template slot ratio chosen by the script (already snapped to a preset).
    // null only when no items had usable dimensions
    itemAspectRatio: v.union(v.number(), v.null()),
    // optional pre-baked board label settings — forks inherit when present
    labels: v.optional(v.union(boardLabelSettingsValidator, v.null())),
    cover: v.optional(seedCoverImageValidator),
    coverFraming: v.optional(v.union(templateCoverFramingValidator, v.null())),
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
    const coverMediaAssetId = await storeSeedCoverImage(
      ctx,
      author._id,
      args.cover
    )

    const result: SeedInsertResult = await ctx.runMutation(
      internal.marketplace.templates.seed.insertSeedTemplate,
      {
        authorId: author._id,
        title: args.title,
        description: args.description,
        category: args.category,
        tags: args.tags,
        coverMediaAssetId,
        ...(args.coverFraming !== undefined
          ? { coverFraming: args.coverFraming }
          : {}),
        suggestedTiers: args.suggestedTiers ?? [...DEFAULT_TEMPLATE_TIERS],
        ...(args.criteria ? { criteria: args.criteria } : {}),
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
