// convex/marketplace/templates/seed.ts
// seed-gated template maintenance helpers for tests & local repair

import { ConvexError, v, type Infer } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { generateUserExternalId } from '@tierlistbuilder/contracts/lib/ids'
import { BATCH_LIMITS } from '../../lib/limits'
import { templateCriteriaValidator } from '../../lib/validators/marketplace'
import {
  findTemplateCardByTemplateId,
  findTemplateStatsByTemplateId,
  requireTemplateStats,
} from './lib/projections'
import { MARKETPLACE_STATS_KEY } from './lib/trending'
import {
  markTemplateUnpublished,
  patchTemplateAndSyncCard,
  patchTemplateAndSyncCardById,
  syncTemplateTagRows,
  upsertMarketplaceStats,
  writeTemplateCard,
} from './lib/writes'

const FEATURED_TEMPLATE_SCAN_CAP = BATCH_LIMITS.featuredTemplateScan

const scanFeaturedCardsOrThrow = async (
  ctx: MutationCtx
): Promise<Doc<'templateCards'>[]> =>
{
  const cards = await ctx.db
    .query('templateCards')
    .withIndex('byIsPubliclyListableFeaturedRank', (q) =>
      q.eq('isPubliclyListable', true).gt('featuredRank', -1)
    )
    .take(FEATURED_TEMPLATE_SCAN_CAP + 1)
  if (cards.length > FEATURED_TEMPLATE_SCAN_CAP)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `featured templates exceed scan cap (${FEATURED_TEMPLATE_SCAN_CAP}); clear them manually`,
    })
  }
  return cards
}

interface SeedUserStatus
{
  accountExists: boolean
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
    const rankedCards = await scanFeaturedCardsOrThrow(ctx)

    await Promise.all(
      rankedCards.map(async (card) =>
      {
        await patchTemplateAndSyncCardById(ctx, card.templateId, {
          featuredRank: null,
        })
      })
    )
    return {
      cleared: rankedCards.length,
      scanned: rankedCards.length,
    }
  },
})

// dev-only: assign a curated trio (or N-tuple) of featured templates by seed
// externalId. clears any pre-existing featuredRank in the same call so the
// list shows EXACTLY the requested templates in the requested order
export const setFeaturedTrioByExternalIdsImpl = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    externalIds: v.array(v.string()),
  },
  returns: v.object({
    cleared: v.number(),
    promoted: v.array(
      v.object({
        externalId: v.string(),
        slug: v.string(),
        featuredRank: v.number(),
      })
    ),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    cleared: number
    promoted: { externalId: string; slug: string; featuredRank: number }[]
  }> =>
  {
    if (args.externalIds.length > FEATURED_TEMPLATE_SCAN_CAP)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `cannot promote more than ${FEATURED_TEMPLATE_SCAN_CAP} templates at once`,
      })
    }
    // resolve & validate every requested template up-front so a missing one
    // aborts the call before any patches land. seed externalIds are scoped
    // by (datasetKey, releaseId) — composite index keeps this an O(N) walk
    const resolved: { externalId: string; template: Doc<'templates'> }[] = []
    for (const externalId of args.externalIds)
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', args.datasetKey)
            .eq('seedReleaseId', args.releaseId)
            .eq('seedExternalId', externalId)
        )
        .unique()
      if (!template)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `template not found by seed externalId: ${args.datasetKey}:${args.releaseId}:${externalId}`,
        })
      }
      resolved.push({ externalId, template })
    }

    // clear all existing featured ranks first so the new trio is the entire
    // featured set; otherwise stale rank=0 templates would still surface.
    const rankedRows = await scanFeaturedCardsOrThrow(ctx)
    const requestedIds = new Set(resolved.map((entry) => entry.template._id))
    const toClear = rankedRows
      .map((card) => card.templateId)
      .filter((id) => !requestedIds.has(id))
    await Promise.all(
      toClear.map(async (templateId) =>
      {
        await patchTemplateAndSyncCardById(ctx, templateId, {
          featuredRank: null,
        })
      })
    )

    // promote in input order: first externalId gets rank 0 (top hero slot)
    const promoted: {
      externalId: string
      slug: string
      featuredRank: number
    }[] = []
    for (let index = 0; index < resolved.length; index++)
    {
      const entry = resolved[index]
      await patchTemplateAndSyncCard(ctx, entry.template, {
        featuredRank: index,
      })
      promoted.push({
        externalId: entry.externalId,
        slug: entry.template.slug,
        featuredRank: index,
      })
    }
    return { cleared: toClear.length, promoted }
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

    const now = Date.now()
    await upsertMarketplaceStats(ctx, {
      publicTemplateCount: count,
      publicTemplateCountByCategory: countByCategory,
      updatedAt: now,
    })
    return { count, countByCategory }
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

export const recomputeTemplateTags = internalAction({
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

export const recomputeTemplateCards = internalAction({
  args: {},
  returns: v.object({
    templatesScanned: v.number(),
    cardsDeleted: v.number(),
  }),
  handler: async (
    ctx
  ): Promise<{ templatesScanned: number; cardsDeleted: number }> =>
  {
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
const WIPE_CHILD_ROW_BATCH = BATCH_LIMITS.cascadeDelete

const wipePhaseValidator = v.union(
  v.literal('templates'),
  v.literal('forkedBoards'),
  v.literal('marketplaceStats')
)
type WipePhase = Infer<typeof wipePhaseValidator>

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

const NUMERIC_WIPE_KEYS = [
  'templatesDeleted',
  'itemsDeleted',
  'tagsDeleted',
  'cardsDeleted',
  'statsDeleted',
  'boardsDeleted',
  'boardItemsDeleted',
  'boardTiersDeleted',
] as const satisfies readonly (keyof WipeBatchResult)[]

const emptyWipeBatchResult = (): WipeBatchResult => ({
  templatesDeleted: 0,
  itemsDeleted: 0,
  tagsDeleted: 0,
  cardsDeleted: 0,
  statsDeleted: 0,
  boardsDeleted: 0,
  boardItemsDeleted: 0,
  boardTiersDeleted: 0,
  marketplaceStatsCleared: false,
})

const emptyWipeMutationResult = (isDone: boolean) => ({
  isDone,
  ...emptyWipeBatchResult(),
})

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
      const template = await ctx.db.query('templates').first()
      if (!template) return emptyWipeMutationResult(true)

      const items = await ctx.db
        .query('templateItems')
        .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
        .take(WIPE_CHILD_ROW_BATCH)
      if (items.length > 0)
      {
        await Promise.all(items.map((row) => ctx.db.delete(row._id)))
        return {
          ...emptyWipeMutationResult(false),
          itemsDeleted: items.length,
        }
      }

      const tags = await ctx.db
        .query('templateTags')
        .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
        .take(WIPE_CHILD_ROW_BATCH)
      if (tags.length > 0)
      {
        await Promise.all(tags.map((row) => ctx.db.delete(row._id)))
        return {
          ...emptyWipeMutationResult(false),
          tagsDeleted: tags.length,
        }
      }

      const [card, stats] = await Promise.all([
        findTemplateCardByTemplateId(ctx, template._id),
        findTemplateStatsByTemplateId(ctx, template._id),
      ])
      await Promise.all([
        card ? ctx.db.delete(card._id) : Promise.resolve(),
        stats ? ctx.db.delete(stats._id) : Promise.resolve(),
      ])
      await ctx.db.delete(template._id)
      return {
        ...emptyWipeMutationResult(false),
        templatesDeleted: 1,
        cardsDeleted: card ? 1 : 0,
        statsDeleted: stats ? 1 : 0,
      }
    }

    if (args.phase === 'forkedBoards')
    {
      const board = await ctx.db
        .query('boards')
        .withIndex('bySourceTemplateId', (q) => q.gt('sourceTemplate.id', null))
        .first()
      if (!board) return emptyWipeMutationResult(true)

      const items = await ctx.db
        .query('boardItems')
        .withIndex('byBoardAndTier', (q) => q.eq('boardId', board._id))
        .take(WIPE_CHILD_ROW_BATCH)
      if (items.length > 0)
      {
        await Promise.all(items.map((row) => ctx.db.delete(row._id)))
        return {
          ...emptyWipeMutationResult(false),
          boardItemsDeleted: items.length,
        }
      }

      const tiers = await ctx.db
        .query('boardTiers')
        .withIndex('byBoard', (q) => q.eq('boardId', board._id))
        .take(WIPE_CHILD_ROW_BATCH)
      if (tiers.length > 0)
      {
        await Promise.all(tiers.map((row) => ctx.db.delete(row._id)))
        return {
          ...emptyWipeMutationResult(false),
          boardTiersDeleted: tiers.length,
        }
      }

      await ctx.db.delete(board._id)
      return {
        ...emptyWipeMutationResult(false),
        boardsDeleted: 1,
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
      ...emptyWipeMutationResult(true),
      marketplaceStatsCleared: marketplaceStats !== null,
    }
  },
})

export const wipeSeededDataBatch = internalAction({
  args: {},
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
  handler: async (ctx): Promise<WipeBatchResult> =>
  {
    const totals = emptyWipeBatchResult()
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
        for (const key of NUMERIC_WIPE_KEYS)
        {
          totals[key] += result[key]
        }
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
