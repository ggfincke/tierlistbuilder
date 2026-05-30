// tests/convex/marketplaceTemplates.test.ts
// Convex marketplace template publish, listing, clone, & draft progress

import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  MAX_TEMPLATE_ITEM_PAGE_SIZE,
  MAX_TEMPLATE_LIST_LIMIT,
  type MarketplaceTemplateCount,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
  DEFAULT_TEMPLATE_CRITERION_NAME,
  DEFAULT_TEMPLATE_CRITERION_PROMPT,
  type MarketplaceTemplateCriterion,
  type MarketplaceTemplateCriterionSnapshot,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  CONTROVERSY_PERCENTILE_MIN,
  MIN_RANKINGS_FOR_CONTROVERSY_BADGES,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { MAX_STANDARD_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type {
  BoardLabelSettings,
  ImageFit,
  ItemAspectRatioMode,
  ItemTransform,
  MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardItemWire,
  CloudBoardState,
  CloudBoardStateItem,
  CloudBoardTierWire,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  asUser,
  type ConvexTestHandle,
  expectConvexCode,
  makeRateLimitedTest as makeTest,
  runScheduled,
  seedCloudBoard,
  seedPublishedRanking,
  seedPublishedTemplate,
  seedTileMediaAsset,
  seedUser,
  TEST_CRITERIA,
  toCriterionSnapshot,
  withSeedEnv,
  withFakeTimers,
} from './convexTestHelpers'

// seed maintenance fns are internal-only; auth lives on /api/seed/* routes.
// most tests call impls directly; route regressions use HTTP when dispatch matters
const setTemplateCriteria = async (
  t: ConvexTestHandle,
  slug: string,
  criteria: MarketplaceTemplateCriterion[] = TEST_CRITERIA
) =>
  await t.mutation(
    internal.marketplace.templates.seed.setTemplateCriteriaImpl,
    { slug, criteria }
  )

const SEED_SECRET = 'test-seed-secret'
const BACKFILL_RANKING_COUNT_ROUTE = '/api/seed/backfill-ranking-count'

const withLargeTemplateJobsEnabled = async (
  run: () => Promise<void>
): Promise<void> =>
{
  const previous = process.env.LARGE_TEMPLATE_FEATURE_STATE
  process.env.LARGE_TEMPLATE_FEATURE_STATE = 'public'
  try
  {
    await run()
  }
  finally
  {
    if (previous === undefined)
    {
      delete process.env.LARGE_TEMPLATE_FEATURE_STATE
    }
    else
    {
      process.env.LARGE_TEMPLATE_FEATURE_STATE = previous
    }
  }
}

const readPublicTemplateCount = async (
  t: ConvexTestHandle
): Promise<MarketplaceTemplateCount> =>
  (await t.query(api.marketplace.templates.queries.getTemplatesGallery, {}))
    .templateCount

interface SeedSourceBoardOptions
{
  itemAspectRatio?: number
  itemAspectRatioMode?: ItemAspectRatioMode
  defaultItemImageFit?: ImageFit
  defaultItemImagePadding?: number
  imageItemFit?: ImageFit | null
  imageItemPadding?: number
  imageItemTransform?: ItemTransform
  imageItemMediaPlate?: MediaPlate
  labels?: BoardLabelSettings
}

const seedSourceBoard = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>,
  options: SeedSourceBoardOptions = {}
): Promise<{ mediaExternalId: string }> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const { mediaAssetId, storageId } = await seedTileMediaAsset(ctx, {
      ownerId,
      externalId: 'media-source',
      dedupeHash: 'hash-source',
      contentHash: 'hash-source',
      width: 64,
      height: 64,
      createdAt: now,
    })
    const boardId = await seedCloudBoard(ctx, {
      externalId: 'board-source',
      ownerId,
      title: 'Source Board',
      now,
      itemAspectRatio: options.itemAspectRatio,
      itemAspectRatioMode: options.itemAspectRatioMode,
      defaultItemImageFit: options.defaultItemImageFit,
      defaultItemImagePadding: options.defaultItemImagePadding,
      labels: options.labels,
      activeItemCount: 2,
      unrankedItemCount: 1,
      librarySummary: {
        coverItems: [
          {
            label: 'Image item',
            externalId: 'source-item-1',
            storageId,
          },
          {
            label: 'Text item',
            externalId: 'source-item-2',
            storageId: null,
          },
        ],
        tierCount: 1,
        tierColors: [{ kind: 'palette', index: 1 }],
        tierBreakdown: [
          {
            tierIndex: 0,
            itemCount: 1,
            colorSpec: { kind: 'palette', index: 1 },
          },
        ],
      },
    })
    const tierId = await ctx.db.insert('boardTiers', {
      boardId,
      externalId: 'tier-source',
      name: 'Great',
      colorSpec: { kind: 'palette', index: 1 },
      order: 0,
    })

    await ctx.db.insert('boardItems', {
      boardId,
      tierId,
      externalId: 'source-item-1',
      label: 'Image item',
      altText: 'Image item alt',
      ...(options.imageItemMediaPlate
        ? { mediaPlate: options.imageItemMediaPlate }
        : {}),
      mediaAssetId,
      order: 0,
      deletedAt: null,
      aspectRatio: 1,
      ...(options.imageItemFit === null
        ? {}
        : { imageFit: options.imageItemFit ?? 'cover' }),
      ...(options.imageItemTransform
        ? { transform: options.imageItemTransform }
        : {}),
      ...(options.imageItemPadding !== undefined
        ? { imagePadding: options.imageItemPadding }
        : {}),
    })
    await ctx.db.insert('boardItems', {
      boardId,
      tierId: null,
      externalId: 'source-item-2',
      label: 'Text item',
      backgroundColor: '#336699',
      mediaAssetId: null,
      order: 1,
      deletedAt: null,
    })

    return { mediaExternalId: 'media-source' }
  })

const addMediaPreviewVariant = async (
  t: ConvexTestHandle,
  externalId: string,
  contentHash = 'hash-source-preview'
): Promise<void> =>
  await t.run(async (ctx) =>
  {
    const mediaAsset = await ctx.db
      .query('mediaAssets')
      .withIndex('byExternalId', (q) => q.eq('externalId', externalId))
      .unique()
    if (!mediaAsset) throw new Error(`missing media asset: ${externalId}`)

    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' })
    )
    const now = Date.now()
    const previewVariant = {
      storageId,
      width: 1024,
      height: 576,
      byteSize: 3,
      mimeType: 'image/png',
      contentHash,
    }
    await ctx.db.patch(mediaAsset._id, { previewVariant })
    await ctx.db.insert('mediaVariants', {
      mediaAssetId: mediaAsset._id,
      kind: 'preview',
      ...previewVariant,
      createdAt: now,
    })
  })

const seedTierPreset = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>
): Promise<string> =>
  await t.run(async (ctx) =>
  {
    await ctx.db.insert('tierPresets', {
      externalId: 'preset-consumer',
      ownerId,
      name: 'Consumer Preset',
      tiers: [
        { name: 'Keep', colorSpec: { kind: 'palette', index: 0 } },
        { name: 'Skip', colorSpec: { kind: 'palette', index: 2 } },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return 'preset-consumer'
  })

interface AggregateRankingTierSeed
{
  externalId: string
  name: string
  order: number
}

interface AggregateRankingItemSeed
{
  templateItemId: Id<'templateItems'>
  templateItemExternalId: string
  tierExternalId: string
  externalId: string
  label: string
  order: number
}

interface AggregateRankingSeed
{
  ownerId: Id<'users'>
  templateId: Id<'templates'>
  templateSlug: string
  templateTitle: string
  slug: string
  title: string
  now: number
  visibility?: 'public' | 'unlisted'
  publicationState?: 'published' | 'unpublished'
  isPubliclyListable?: boolean
  criterion?: MarketplaceTemplateCriterionSnapshot
  tiers: AggregateRankingTierSeed[]
  items: AggregateRankingItemSeed[]
}

const STANDARD_AGGREGATE_TIERS: AggregateRankingTierSeed[] = [
  { externalId: 'tier-top', name: 'Top', order: 0 },
  { externalId: 'tier-mid', name: 'Middle', order: 1 },
  { externalId: 'tier-low', name: 'Low', order: 2 },
]

const makeAggregateItem = (
  itemIds: readonly Id<'templateItems'>[],
  index: number,
  tierExternalId: string,
  externalIdPrefix = 'ranking-item'
): AggregateRankingItemSeed => ({
  templateItemId: itemIds[index]!,
  templateItemExternalId: `aggregate-item-${index}`,
  tierExternalId,
  externalId: `${externalIdPrefix}-${index}`,
  label: `Aggregate Item ${index}`,
  order: index,
})

const makeAggregateItemsForBuckets = (
  itemIds: readonly Id<'templateItems'>[],
  externalIdPrefix: string,
  bucketIndexes: readonly number[],
  tiers: readonly AggregateRankingTierSeed[] = STANDARD_AGGREGATE_TIERS
): AggregateRankingItemSeed[] =>
  bucketIndexes.map((bucketIndex, index) =>
    makeAggregateItem(
      itemIds,
      index,
      tiers[bucketIndex]!.externalId,
      externalIdPrefix
    )
  )

const seedAggregateRanking = async (
  t: ConvexTestHandle,
  args: AggregateRankingSeed
): Promise<Id<'publishedRankings'>> =>
  await t.run(async (ctx) =>
  {
    const boardId = await seedCloudBoard(ctx, {
      externalId: `${args.slug}-board`,
      ownerId: args.ownerId,
      title: args.title,
      sourceTemplateId: args.templateId,
      sourceTemplateCategory: 'gaming',
      sourceTemplateSizeClass: 'standard',
      activeItemCount: args.items.length,
      unrankedItemCount: 0,
      templateProgressState: 'complete',
      now: args.now,
    })
    const rankingId = await seedPublishedRanking(ctx, {
      ownerId: args.ownerId,
      slug: args.slug,
      sourceTemplateId: args.templateId,
      sourceBoardId: boardId,
      sourceTemplateSlug: args.templateSlug,
      sourceTemplateTitle: args.templateTitle,
      title: args.title,
      itemCount: args.items.length,
      now: args.now,
      visibility: args.visibility,
      publicationState: args.publicationState,
      isPubliclyListable: args.isPubliclyListable,
      tierCount: args.tiers.length,
      criterion: args.criterion,
    })
    await Promise.all(
      args.tiers.map((tier) =>
        ctx.db.insert('publishedRankingTiers', {
          rankingId,
          externalId: tier.externalId,
          name: tier.name,
          description: null,
          colorSpec: { kind: 'palette', index: tier.order },
          rowColorSpec: null,
          order: tier.order,
        })
      )
    )
    await Promise.all(
      args.items.map((item) =>
        ctx.db.insert('publishedRankingItems', {
          rankingId,
          templateItemId: item.templateItemId,
          templateItemExternalId: item.templateItemExternalId,
          externalId: item.externalId,
          tierExternalId: item.tierExternalId,
          label: item.label,
          backgroundColor: null,
          altText: null,
          mediaAssetId: null,
          order: item.order,
          aspectRatio: null,
          imageFit: null,
          transform: null,
          imagePadding: null,
        })
      )
    )
    return rankingId
  })

const seedAggregateTemplate = async (
  t: ConvexTestHandle,
  authorId: Id<'users'>,
  args: {
    slug?: string
    title?: string
    criteria?: MarketplaceTemplateCriterion[]
  } = {}
) =>
  await t.run(async (ctx) =>
  {
    const slug = args.slug ?? 'AggTpl0001'
    const templateId = await seedPublishedTemplate(ctx, {
      slug,
      authorId,
      title: args.title ?? 'Aggregate Template',
      sizeClass: 'standard',
      itemCount: 3,
      criteria: args.criteria,
    })
    await ctx.db.patch(templateId, {
      suggestedTiers: [
        { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
        { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
        { name: 'B', colorSpec: { kind: 'palette', index: 2 } },
      ],
    })
    const items: Id<'templateItems'>[] = []
    for (let i = 0; i < 3; i++)
    {
      items.push(
        await ctx.db.insert('templateItems', {
          templateId,
          externalId: `aggregate-item-${i}`,
          label: `Aggregate Item ${i}`,
          backgroundColor: null,
          mediaPlate: i === 1 ? 'light' : null,
          altText: null,
          mediaAssetId: null,
          order: i,
          aspectRatio: null,
          imageFit: null,
          transform: null,
          imagePadding: null,
        })
      )
    }
    return { templateId, itemIds: items, slug }
  })

const seedLargeSourceBoard = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>,
  externalId: string
): Promise<void> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const boardId = await seedCloudBoard(ctx, {
      externalId,
      ownerId,
      title: 'Large Source Board',
      now,
      activeItemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
      unrankedItemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
    })

    for (let i = 0; i < MAX_STANDARD_CLOUD_BOARD_ITEMS + 1; i++)
    {
      await ctx.db.insert('boardItems', {
        boardId,
        tierId: null,
        externalId: `large-item-${i}`,
        label: `Large Item ${i}`,
        mediaAssetId: null,
        order: i,
        deletedAt: null,
      })
    }
  })

const seedLargeTemplate = async (
  t: ConvexTestHandle,
  authorId: Id<'users'>
): Promise<string> =>
  await t.run(async (ctx) =>
  {
    const itemCount = MAX_STANDARD_CLOUD_BOARD_ITEMS + 1
    const templateId = await seedPublishedTemplate(ctx, {
      slug: 'LargeTpl01',
      authorId,
      title: 'Large Template',
      sizeClass: 'large',
      itemCount,
    })
    for (let i = 0; i < itemCount; i++)
    {
      await ctx.db.insert('templateItems', {
        templateId,
        externalId: `large-template-item-${i}`,
        label: `Large Template Item ${i}`,
        backgroundColor: null,
        altText: null,
        mediaAssetId: null,
        order: i,
        aspectRatio: null,
        imageFit: null,
        transform: null,
        imagePadding: null,
      })
    }
    return 'LargeTpl01'
  })

const seedLargeCompletedRankingBoard = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>
): Promise<string> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const itemCount = MAX_STANDARD_CLOUD_BOARD_ITEMS + 1
    const templateId = await seedPublishedTemplate(ctx, {
      slug: 'LargeRankT',
      authorId: ownerId,
      title: 'Large Ranking Template',
      sizeClass: 'large',
      itemCount,
    })
    const boardExternalId = 'large-ranking-board'
    await seedCloudBoard(ctx, {
      externalId: boardExternalId,
      ownerId,
      title: 'Large Finished Ranking',
      sourceTemplateId: templateId,
      sourceTemplateCategory: 'gaming',
      sourceTemplateSizeClass: 'large',
      now,
      activeItemCount: itemCount,
      unrankedItemCount: 0,
      templateProgressState: 'complete',
    })
    return boardExternalId
  })

const seedRankingMediaSnapshot = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>
): Promise<Id<'mediaAssets'>> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now() - 2 * 60 * 60 * 1000
    const { mediaAssetId } = await seedTileMediaAsset(ctx, {
      ownerId,
      externalId: 'ranking-media',
      dedupeHash: 'ranking-media-hash',
      contentHash: 'ranking-media-hash',
      blob: new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' }),
      width: 64,
      height: 64,
      createdAt: now,
    })
    const templateId = await seedPublishedTemplate(ctx, {
      slug: 'MediaRankT',
      authorId: ownerId,
      title: 'Media Ranking Template',
      sizeClass: 'standard',
      itemCount: 1,
    })
    const templateItemId = await ctx.db.insert('templateItems', {
      templateId,
      externalId: 'media-template-item',
      label: 'Media Template Item',
      backgroundColor: null,
      altText: null,
      mediaAssetId: null,
      order: 0,
      aspectRatio: null,
      imageFit: null,
      transform: null,
      imagePadding: null,
    })
    const boardId = await seedCloudBoard(ctx, {
      externalId: 'media-ranking-board',
      ownerId,
      title: 'Media Ranking Board',
      sourceTemplateId: templateId,
      sourceTemplateCategory: 'gaming',
      sourceTemplateSizeClass: 'standard',
      now,
      activeItemCount: 1,
      unrankedItemCount: 0,
      templateProgressState: 'complete',
    })
    const rankingId = await seedPublishedRanking(ctx, {
      slug: 'MediaRank1',
      ownerId,
      sourceTemplateId: templateId,
      sourceBoardId: boardId,
      sourceTemplateSlug: 'MediaRankT',
      sourceTemplateTitle: 'Media Ranking Template',
      title: 'Media Ranking',
      itemCount: 1,
      now,
    })
    await ctx.db.insert('publishedRankingItems', {
      rankingId,
      templateItemId,
      templateItemExternalId: 'media-template-item',
      externalId: 'media-ranking-item',
      tierExternalId: 'media-tier',
      label: 'Media Ranking Item',
      backgroundColor: null,
      altText: null,
      mediaAssetId,
      order: 0,
      aspectRatio: null,
      imageFit: null,
      transform: null,
      imagePadding: null,
    })
    return mediaAssetId
  })

const toWireTier = (
  tier: CloudBoardState['tiers'][number],
  itemIds: string[]
): CloudBoardTierWire => ({
  externalId: tier.externalId,
  name: tier.name,
  ...(tier.description !== undefined ? { description: tier.description } : {}),
  colorSpec: tier.colorSpec,
  ...(tier.rowColorSpec !== undefined
    ? { rowColorSpec: tier.rowColorSpec }
    : {}),
  itemIds,
})

const toWireItem = (
  item: CloudBoardStateItem,
  tierId: string | null,
  order: number
): CloudBoardItemWire => ({
  externalId: item.externalId,
  tierId,
  ...(item.label !== undefined ? { label: item.label } : {}),
  ...(item.backgroundColor !== undefined
    ? { backgroundColor: item.backgroundColor }
    : {}),
  ...(item.mediaPlate !== undefined ? { mediaPlate: item.mediaPlate } : {}),
  ...(item.altText !== undefined ? { altText: item.altText } : {}),
  ...(item.mediaExternalId !== undefined
    ? { mediaExternalId: item.mediaExternalId }
    : {}),
  order,
  ...(item.aspectRatio !== undefined ? { aspectRatio: item.aspectRatio } : {}),
  ...(item.imageFit !== undefined ? { imageFit: item.imageFit } : {}),
  ...(item.transform !== undefined ? { transform: item.transform } : {}),
})

interface CompletedRankingBoard
{
  ranker: ReturnType<typeof asUser>
  boardExternalId: string
  draft: CloudBoardState
  sortedItems: CloudBoardStateItem[]
}

const completeTemplateRankingBoard = async (
  t: ConvexTestHandle,
  rankerId: Id<'users'>,
  templateSlug: string,
  title: string,
  beforeComplete?: (board: CompletedRankingBoard) => Promise<void>
): Promise<CompletedRankingBoard> =>
{
  const ranker = asUser(t, rankerId)
  const { boardExternalId } = await ranker.mutation(
    api.marketplace.templates.mutations.useTemplate,
    { slug: templateSlug, title }
  )
  const draft = await ranker.query(
    api.workspace.boards.queries.getBoardStateByExternalId,
    { boardExternalId }
  )
  if (!draft) throw new Error('Expected ranking board')

  const sortedItems = draft.items.slice().sort((a, b) => a.order - b.order)
  const board = { ranker, boardExternalId, draft, sortedItems }
  await beforeComplete?.(board)
  await ranker.mutation(
    api.workspace.boards.upsertBoardState.upsertBoardState,
    {
      boardExternalId,
      baseRevision: draft.revision,
      title: draft.title,
      tiers: draft.tiers.map((tier) =>
        toWireTier(
          tier,
          tier.externalId === draft.tiers[0].externalId
            ? sortedItems.map((i) => i.externalId)
            : []
        )
      ),
      items: sortedItems.map((item, order) =>
        toWireItem(item, draft.tiers[0].externalId, order)
      ),
      deletedItemIds: [],
    }
  )
  return board
}

describe('marketplace template Convex functions', () =>
{
  it('publishes templates, lists public ones, resolves unlisted by slug, & maintains the public count', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const { mediaExternalId } = await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    const publicTemplate = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Public Template',
        category: 'gaming',
        tags: ['RPG', 'Favorites', 'rpg'],
        visibility: 'public',
      }
    )
    const unlistedTemplate = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Unlisted Template',
        category: 'movies',
        tags: [],
        visibility: 'unlisted',
        coverMediaExternalId: mediaExternalId,
      }
    )

    const list = await t.query(
      api.marketplace.templates.queries.listTemplates,
      {}
    )
    expect(list.items.map((i) => i.title)).toEqual(['Public Template'])
    expect(list.items[0]).toMatchObject({
      category: 'gaming',
      tags: ['rpg', 'favorites'],
      itemCount: 2,
      visibility: 'public',
    })
    const cardRows = await t.run(
      async (ctx) => await ctx.db.query('templateCards').collect()
    )
    expect(cardRows).toHaveLength(2)
    const publicCard = cardRows.find(
      (card) => card.slug === publicTemplate.slug
    )
    expect(publicCard).toMatchObject({
      title: 'Public Template',
      isPubliclyListable: true,
      coverMedia: null,
      coverItems: [
        {
          label: 'Image item',
          media: {
            externalId: 'media-source',
            width: 64,
            height: 64,
            contentHash: 'hash-source',
          },
        },
      ],
    })
    expect(publicCard?.coverItems.some((item) => 'url' in item.media)).toBe(
      false
    )

    const gallery = await t.query(
      api.marketplace.templates.queries.getTemplatesGallery,
      {}
    )
    expect(gallery.templateCount).toEqual({
      count: 1,
      countByCategory: { gaming: 1 },
    })
    expect(gallery.results.map((i) => i.title)).toEqual(['Public Template'])
    expect(gallery.results[0]).toMatchObject({ access: 'usable' })

    const unlistedDetail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug: unlistedTemplate.slug }
    )
    expect(unlistedDetail).toMatchObject({
      title: 'Unlisted Template',
      visibility: 'unlisted',
      itemCount: 2,
      coverMedia: {
        externalId: 'media-source',
        contentHash: 'hash-source',
      },
      coverItems: [],
    })
    expect(unlistedDetail).not.toHaveProperty('items')
    const firstItemsPage = await t.query(
      api.marketplace.templates.queries.listTemplateItems,
      {
        slug: unlistedTemplate.slug,
        paginationOpts: { cursor: null, numItems: 1 },
      }
    )
    expect(firstItemsPage).toMatchObject({
      isDone: false,
      page: [{ label: 'Image item', order: 0 }],
    })
    const secondItemsPage = await t.query(
      api.marketplace.templates.queries.listTemplateItems,
      {
        slug: unlistedTemplate.slug,
        paginationOpts: {
          cursor: firstItemsPage.continueCursor,
          numItems: 1,
        },
      }
    )
    expect(secondItemsPage).toMatchObject({
      isDone: true,
      page: [{ label: 'Text item', order: 1 }],
    })

    expect(await readPublicTemplateCount(t)).toEqual({
      count: 1,
      countByCategory: { gaming: 1 },
    })

    await caller.mutation(
      api.marketplace.templates.mutations.updateMyTemplateMeta,
      { slug: unlistedTemplate.slug, visibility: 'public' }
    )
    expect(await readPublicTemplateCount(t)).toEqual({
      count: 1,
      countByCategory: { movies: 1 },
    })

    expect(
      await t.query(api.marketplace.templates.queries.getTemplateBySlug, {
        slug: publicTemplate.slug,
      })
    ).toBeNull()

    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: publicTemplate.slug }
    )
    expect(await readPublicTemplateCount(t)).toEqual({
      count: 1,
      countByCategory: { movies: 1 },
    })

    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: unlistedTemplate.slug }
    )
    expect(await readPublicTemplateCount(t)).toEqual({
      count: 0,
      countByCategory: {},
    })
  })

  it('does not expose private author identifiers on public template reads', async () =>
  {
    const t = makeTest()
    const { authorId, slug } = await t.run(async (ctx) =>
    {
      const now = Date.now()
      const authorId = await ctx.db.insert('users', {
        name: 'private-author-name@example.com',
        email: 'private-author-email@example.com',
        createdAt: now,
        updatedAt: now,
        plan: 'free',
      })
      const slug = 'PrivAuth01'
      await seedPublishedTemplate(ctx, {
        authorId,
        slug,
        title: 'Private Author Template',
        itemCount: 1,
        sizeClass: 'standard',
        now,
      })
      return { authorId, slug }
    })

    const detail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug }
    )
    expect(detail?.author).toEqual({
      id: 'unknown-author',
      displayName: 'Tier list creator',
      avatarUrl: null,
    })

    const list = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { limit: 10 }
    )
    const summary = list.items.find((item) => item.slug === slug)
    expect(summary?.author).toEqual({
      id: 'unknown-author',
      displayName: 'Tier list creator',
      avatarUrl: null,
    })

    const serializedPublicPayload = JSON.stringify({ detail, summary })
    expect(serializedPublicPayload).not.toContain(
      'private-author-name@example.com'
    )
    expect(serializedPublicPayload).not.toContain(
      'private-author-email@example.com'
    )
    expect(serializedPublicPayload).not.toContain(authorId)

    const emailSearch = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { search: 'private-author-email@example.com', limit: 10 }
    )
    expect(emailSearch.items).toEqual([])
  })

  it('normalizes related-template limits before reading the rail', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await t.run(async (ctx) =>
    {
      await seedPublishedTemplate(ctx, {
        authorId,
        slug: 'RelTpl0001',
        title: 'Related Anchor',
        category: 'gaming',
        itemCount: 1,
        sizeClass: 'standard',
      })
      await seedPublishedTemplate(ctx, {
        authorId,
        slug: 'RelTpl0002',
        title: 'Related One',
        category: 'gaming',
        itemCount: 1,
        sizeClass: 'standard',
      })
      await seedPublishedTemplate(ctx, {
        authorId,
        slug: 'RelTpl0003',
        title: 'Related Two',
        category: 'gaming',
        itemCount: 1,
        sizeClass: 'standard',
      })
    })

    const fractional = await t.query(
      api.marketplace.templates.queries.getRelatedTemplates,
      { slug: 'RelTpl0001', limit: 1.8 }
    )
    expect(fractional.items).toHaveLength(1)

    await expectConvexCode(
      t.query(api.marketplace.templates.queries.getRelatedTemplates, {
        slug: 'RelTpl0001',
        limit: Number.NaN,
      }),
      CONVEX_ERROR_CODES.invalidInput
    )
    await expectConvexCode(
      t.query(api.marketplace.templates.queries.getRelatedTemplates, {
        slug: 'RelTpl0001',
        limit: Number.POSITIVE_INFINITY,
      }),
      CONVEX_ERROR_CODES.invalidInput
    )
  })

  it('bounds bookmark pagination sizes before paginating saved templates', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const viewerId = await seedUser(t, 'Bookmark User', 'viewer@example.com')
    await t.run(async (ctx) =>
    {
      const now = Date.now()
      for (let index = 0; index < MAX_TEMPLATE_LIST_LIMIT + 5; index++)
      {
        const templateId = await seedPublishedTemplate(ctx, {
          authorId,
          slug: `Bkmk${String(index).padStart(6, '0')}`,
          title: `Bookmark Template ${index}`,
          itemCount: 1,
          sizeClass: 'standard',
          now: now + index,
        })
        await ctx.db.insert('userTemplateBookmarks', {
          userId: viewerId,
          templateId,
          createdAt: now + index,
          updatedAt: now + index,
        })
      }
    })

    const oversized = await asUser(t, viewerId).query(
      api.marketplace.templates.bookmarks.listMyTemplateBookmarks,
      {
        paginationOpts: {
          cursor: null,
          numItems: MAX_TEMPLATE_LIST_LIMIT * 10,
        },
      }
    )
    expect(oversized.page).toHaveLength(MAX_TEMPLATE_LIST_LIMIT)
    expect(oversized.isDone).toBe(false)

    const nonFinite = await asUser(t, viewerId).query(
      api.marketplace.templates.bookmarks.listMyTemplateBookmarks,
      {
        paginationOpts: {
          cursor: null,
          numItems: Number.POSITIVE_INFINITY,
        },
      }
    )
    expect(nonFinite.page).toHaveLength(DEFAULT_TEMPLATE_LIST_LIMIT)
    expect(nonFinite.isDone).toBe(false)
  })

  it('uses preview cover media for template draft thumbnails', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const consumerId = await seedUser(t, 'Template User', 'user@example.com')
    const { mediaExternalId } = await seedSourceBoard(t, authorId)
    await addMediaPreviewVariant(t, mediaExternalId)

    const { slug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Preview Cover Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
        coverMediaExternalId: mediaExternalId,
      }
    )

    await asUser(t, consumerId).mutation(
      api.marketplace.templates.mutations.useTemplate,
      {
        slug,
        title: 'My Draft',
      }
    )

    const drafts = await asUser(t, consumerId).query(
      api.marketplace.templates.queries.getMyTemplateDrafts,
      {}
    )

    expect(drafts.drafts[0]?.template.coverMedia).toMatchObject({
      externalId: mediaExternalId,
      contentHash: 'hash-source-preview',
      width: 1024,
      height: 576,
    })

    const libraryRows = await asUser(t, consumerId).query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(libraryRows[0]).toMatchObject({
      title: 'My Draft',
      sourceTemplateCoverMedia: {
        externalId: mediaExternalId,
        contentHash: 'hash-source-preview',
        width: 1024,
        height: 576,
      },
      sourceTemplateCoverFraming: null,
    })
  })

  it('normalizes trusted criteria patches and preserves them through metadata changes', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Curator', 'curator@example.com')
    const slug = 'Curated001'
    await t.run(
      async (ctx) =>
        await seedPublishedTemplate(ctx, {
          authorId,
          slug,
          title: 'Curated Template',
          itemCount: 2,
          sizeClass: 'standard',
        })
    )

    const criteria: MarketplaceTemplateCriterion[] = [
      {
        externalId: ' Competitive ',
        name: ' Competitive ',
        shortName: ' Comp ',
        prompt: ' Rank by competitive viability. ',
        axisTop: ' Strongest ',
        axisBottom: ' Weakest ',
        order: 0,
        isPrimary: true,
        status: 'active',
      },
      {
        externalId: 'favorites',
        name: 'Favorites',
        shortName: 'Favs',
        prompt: 'Rank by personal preference.',
        axisTop: 'Favorite',
        axisBottom: 'Least favorite',
        order: 1,
        isPrimary: false,
        status: 'active',
      },
    ]
    const expectedCriteria: MarketplaceTemplateCriterion[] = [
      {
        externalId: 'competitive',
        name: 'Competitive',
        shortName: 'Comp',
        prompt: 'Rank by competitive viability.',
        axisTop: 'Strongest',
        axisBottom: 'Weakest',
        order: 0,
        isPrimary: true,
        status: 'active',
      },
      criteria[1],
    ]

    const result = await setTemplateCriteria(t, slug, criteria)
    expect(result).toEqual({
      slug,
      criteria: expectedCriteria,
    })

    const caller = asUser(t, authorId)
    await caller.mutation(
      api.marketplace.templates.mutations.updateMyTemplateMeta,
      { slug, title: 'Curated Template Updated' }
    )
    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug }
    )
    await caller.mutation(
      api.marketplace.templates.mutations.republishMyTemplate,
      { slug }
    )

    const detail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug }
    )
    expect(detail).toMatchObject({
      title: 'Curated Template Updated',
      criteria: expectedCriteria,
    })
  })

  it('keeps large publish and clone behind Plus and job feature gates', async () =>
  {
    const t = makeTest()
    const freeAuthorId = await seedUser(t, 'Free Author', 'free@example.com')
    const plusAuthorId = await seedUser(
      t,
      'Plus Author',
      'plus@example.com',
      'plus'
    )
    const consumerId = await seedUser(t, 'Consumer', 'consumer@example.com')

    await seedLargeSourceBoard(t, freeAuthorId, 'board-large-free')
    await seedLargeSourceBoard(t, plusAuthorId, 'board-large-plus')

    await expectConvexCode(
      asUser(t, freeAuthorId).mutation(
        api.marketplace.templates.mutations.publishFromBoard,
        {
          boardExternalId: 'board-large-free',
          title: 'Free Large',
          category: 'gaming',
          tags: [],
          visibility: 'public',
        }
      ),
      CONVEX_ERROR_CODES.largeTemplateRequiresPlus
    )

    await expectConvexCode(
      asUser(t, plusAuthorId).mutation(
        api.marketplace.templates.mutations.publishFromBoard,
        {
          boardExternalId: 'board-large-plus',
          title: 'Plus Large',
          category: 'gaming',
          tags: [],
          visibility: 'public',
        }
      ),
      CONVEX_ERROR_CODES.largeTemplateFeatureNotReady
    )

    const slug = await seedLargeTemplate(t, plusAuthorId)
    await t.mutation(
      internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
      { authorId: plusAuthorId, cursor: null }
    )

    const freeGallery = await t.query(
      api.marketplace.templates.queries.getTemplatesGallery,
      {}
    )
    expect(freeGallery.results).toEqual([
      expect.objectContaining({ slug, access: 'requiresPlus' }),
    ])

    const plusGallery = await asUser(t, plusAuthorId).query(
      api.marketplace.templates.queries.getTemplatesGallery,
      {}
    )
    expect(plusGallery.results).toEqual([
      expect.objectContaining({ slug, access: 'featureNotReady' }),
    ])

    const largeDetail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug }
    )
    expect(largeDetail).toMatchObject({
      slug,
      sizeClass: 'large',
      itemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
      access: 'requiresPlus',
    })
    expect(largeDetail).not.toHaveProperty('items')
    const largeItemsPage = await t.query(
      api.marketplace.templates.queries.listTemplateItems,
      {
        slug,
        paginationOpts: {
          cursor: null,
          numItems: MAX_TEMPLATE_ITEM_PAGE_SIZE + 50,
        },
      }
    )
    expect(largeItemsPage.page).toHaveLength(MAX_TEMPLATE_ITEM_PAGE_SIZE)
    expect(largeItemsPage.isDone).toBe(false)
    expect(largeItemsPage.page[0]).toMatchObject({
      label: 'Large Template Item 0',
      order: 0,
    })
    const finalLargeItemsPage = await t.query(
      api.marketplace.templates.queries.listTemplateItems,
      {
        slug,
        paginationOpts: {
          cursor: largeItemsPage.continueCursor,
          numItems: MAX_TEMPLATE_ITEM_PAGE_SIZE,
        },
      }
    )
    expect(finalLargeItemsPage).toMatchObject({
      isDone: true,
      page: [{ label: 'Large Template Item 200', order: 200 }],
    })

    await expectConvexCode(
      asUser(t, consumerId).mutation(
        api.marketplace.templates.mutations.useTemplate,
        { slug }
      ),
      CONVEX_ERROR_CODES.largeTemplateRequiresPlus
    )
    await expectConvexCode(
      asUser(t, plusAuthorId).mutation(
        api.marketplace.templates.mutations.useTemplate,
        { slug }
      ),
      CONVEX_ERROR_CODES.largeTemplateFeatureNotReady
    )
  })

  it('publishes and clones large templates through scheduled jobs', async () =>
    await withFakeTimers(async () =>
    {
      await withLargeTemplateJobsEnabled(async () =>
      {
        const t = makeTest()
        const authorId = await seedUser(
          t,
          'Plus Author',
          'plus-author@example.com',
          'plus'
        )
        const consumerId = await seedUser(
          t,
          'Plus Consumer',
          'plus-consumer@example.com',
          'plus'
        )
        await seedLargeSourceBoard(t, authorId, 'board-large-job')

        const publish = await asUser(t, authorId).mutation(
          api.marketplace.templates.mutations.publishFromBoard,
          {
            boardExternalId: 'board-large-job',
            title: 'Large Job Template',
            category: 'gaming',
            tags: ['big'],
            visibility: 'public',
          }
        )
        expect(publish).toMatchObject({
          status: 'jobQueued',
          slug: expect.any(String),
          jobId: expect.any(String),
        })
        if (publish.status !== 'jobQueued') throw new Error('expected job')
        expect(
          await t.query(api.marketplace.templates.queries.getTemplateBySlug, {
            slug: publish.slug,
          })
        ).toBeNull()

        await runScheduled(t)

        const publishJob = await asUser(t, authorId).query(
          api.marketplace.templates.queries.getMyTemplatePublishJob,
          { jobId: publish.jobId as Id<'templatePublishJobs'> }
        )
        expect(publishJob).toMatchObject({
          status: 'succeeded',
          processedItemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
        })
        const detail = await t.query(
          api.marketplace.templates.queries.getTemplateBySlug,
          { slug: publish.slug }
        )
        expect(detail).toMatchObject({
          slug: publish.slug,
          itemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
          publicationState: 'published',
        })

        const clone = await asUser(t, consumerId).mutation(
          api.marketplace.templates.mutations.useTemplate,
          { slug: publish.slug, title: 'Large Clone' }
        )
        expect(clone).toMatchObject({
          status: 'jobQueued',
          boardExternalId: expect.any(String),
          jobId: expect.any(String),
        })
        if (clone.status !== 'jobQueued') throw new Error('expected job')
        expect(
          await asUser(t, consumerId).query(
            api.workspace.boards.queries.getBoardStateByExternalId,
            { boardExternalId: clone.boardExternalId }
          )
        ).toBeNull()
        expect(
          (
            await asUser(t, consumerId).query(
              api.workspace.boards.queries.getMyLibraryBoards,
              {}
            )
          )[0]
        ).toMatchObject({
          externalId: clone.boardExternalId,
          publishState: 'draft',
          syncState: 'pending',
          sourceTemplateSizeClass: 'large',
        })

        await runScheduled(t)

        const cloneJob = await asUser(t, consumerId).query(
          api.marketplace.templates.queries.getMyTemplateCloneJob,
          { jobId: clone.jobId as Id<'templateCloneJobs'> }
        )
        expect(cloneJob).toMatchObject({
          status: 'succeeded',
          processedItemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
        })
        const board = await asUser(t, consumerId).query(
          api.workspace.boards.queries.getBoardStateByExternalId,
          { boardExternalId: clone.boardExternalId }
        )
        expect(board).toMatchObject({
          title: 'Large Clone',
          items: expect.arrayContaining([
            expect.objectContaining({ label: 'Large Item 0' }),
            expect.objectContaining({ label: 'Large Item 200' }),
          ]),
        })
      })
    }))

  it('rejects large ranking publish until ranking jobs exist', async () =>
  {
    const t = makeTest()
    const plusUserId = await seedUser(
      t,
      'Plus Ranker',
      'plus-ranker@example.com',
      'plus'
    )
    const boardExternalId = await seedLargeCompletedRankingBoard(t, plusUserId)

    await expectConvexCode(
      asUser(t, plusUserId).mutation(
        api.marketplace.rankings.public.mutations.publishRankingFromBoard,
        {
          boardExternalId,
          title: 'Large Ranking',
          visibility: 'public',
        }
      ),
      CONVEX_ERROR_CODES.cloudItemLimitExceeded
    )
  })

  it('keeps ranking snapshot media reachable during orphan GC', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t, 'Media Ranker', 'media-ranker@example.com')
    const mediaAssetId = await seedRankingMediaSnapshot(t, userId)

    const result = await t.mutation(
      internal.platform.media.internal.gcOrphanedMediaAssets,
      { cursor: null }
    )
    const remaining = await t.run(async (ctx) => await ctx.db.get(mediaAssetId))

    expect(result.deleted).toBe(0)
    expect(remaining).not.toBeNull()
  })

  it('keeps large job failures and cancelation out of public listings', async () =>
    await withFakeTimers(async () =>
    {
      await withLargeTemplateJobsEnabled(async () =>
      {
        const t = makeTest()
        const authorId = await seedUser(
          t,
          'Plus Author',
          'plus-cancel@example.com',
          'plus'
        )
        await seedLargeSourceBoard(t, authorId, 'board-large-cancel')
        const caller = asUser(t, authorId)

        const canceled = await caller.mutation(
          api.marketplace.templates.mutations.publishFromBoard,
          {
            boardExternalId: 'board-large-cancel',
            title: 'Canceled Large',
            category: 'gaming',
            tags: [],
            visibility: 'public',
          }
        )
        if (canceled.status !== 'jobQueued') throw new Error('expected job')
        await caller.mutation(
          api.marketplace.templates.mutations.cancelTemplatePublishJob,
          { jobId: canceled.jobId as Id<'templatePublishJobs'> }
        )
        await runScheduled(t)
        expect(
          await t.query(api.marketplace.templates.queries.getTemplateBySlug, {
            slug: canceled.slug,
          })
        ).toBeNull()

        await seedLargeSourceBoard(t, authorId, 'board-large-stale')
        const stale = await caller.mutation(
          api.marketplace.templates.mutations.publishFromBoard,
          {
            boardExternalId: 'board-large-stale',
            title: 'Stale Large',
            category: 'gaming',
            tags: [],
            visibility: 'public',
          }
        )
        if (stale.status !== 'jobQueued') throw new Error('expected job')
        await t.run(async (ctx) =>
        {
          const board = await ctx.db
            .query('boards')
            .withIndex('byOwnerAndExternalId', (q) =>
              q.eq('ownerId', authorId).eq('externalId', 'board-large-stale')
            )
            .unique()
          await ctx.db.patch(board!._id, { revision: 2 })
        })
        await runScheduled(t)

        const staleJob = await caller.query(
          api.marketplace.templates.queries.getMyTemplatePublishJob,
          { jobId: stale.jobId as Id<'templatePublishJobs'> }
        )
        expect(staleJob).toMatchObject({
          status: 'failed',
          errorCode: CONVEX_ERROR_CODES.invalidState,
        })
        expect(
          await t.query(api.marketplace.templates.queries.listTemplates, {})
        ).toMatchObject({ items: [] })
      })
    }))

  it('reflects publish state in library boards & filters listings by tag', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    const before = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(before[0]).toMatchObject({
      publishState: 'wip',
      syncState: 'synced',
      visibility: 'private',
    })
    expect(before[0]).not.toHaveProperty('status')

    const tagged = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Tagged Public',
        category: 'gaming',
        tags: ['RPG', 'Strategy'],
        visibility: 'public',
      }
    )
    const byTag = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    expect(byTag.items.map((i) => i.title)).toEqual(['Tagged Public'])

    await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Untagged',
        category: 'gaming',
        tags: ['party'],
        visibility: 'public',
      }
    )

    const after = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(after[0]).toMatchObject({
      publishState: 'live',
      syncState: 'synced',
      visibility: 'public',
    })
    expect(after[0]).not.toHaveProperty('status')

    const afterReplacement = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    expect(afterReplacement.items).toEqual([])

    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: tagged.slug }
    )
    const afterUnpublish = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    expect(afterUnpublish.items).toEqual([])
  })

  it('tracks rolling template metrics for trending and owner management reads', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const consumerId = await seedUser(t, 'Consumer', 'consumer@example.com')
    await seedSourceBoard(t, authorId)

    const { slug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Trending Template',
        category: 'gaming',
        tags: ['trend'],
        visibility: 'public',
      }
    )

    await t.mutation(api.marketplace.templates.mutations.recordTemplateView, {
      slug,
    })
    const consumer = asUser(t, consumerId)
    await consumer.mutation(
      api.marketplace.templates.mutations.recordTemplateView,
      {
        slug,
      }
    )
    await consumer.mutation(
      api.marketplace.templates.mutations.recordTemplateView,
      {
        slug,
      }
    )
    await consumer.mutation(api.marketplace.templates.mutations.useTemplate, {
      slug,
    })
    await t.mutation(
      internal.marketplace.templates.internal.recomputeTemplateTrendingScores,
      { cursor: null }
    )

    const gallery = await t.query(
      api.marketplace.templates.queries.getTemplatesGallery,
      { sort: 'trending' }
    )
    expect(gallery.trending[0]).toMatchObject({
      slug,
      weeklyForkCount: 1,
      weeklyViewCount: 2,
      forkCount: 1,
      viewCount: 2,
    })
    expect(gallery.trending[0].trendingScore).toBeGreaterThan(0)
    expect(gallery.results[0]).toMatchObject({ slug })
    const trendingRail = await t.query(
      api.marketplace.templates.queries.getTemplateGalleryRail,
      { rail: 'trending' }
    )
    expect(trendingRail.items[0]).toMatchObject({ slug })

    const owned = await asUser(t, authorId).query(
      api.marketplace.templates.queries.getMyTemplateManagementList,
      {}
    )
    expect(owned.items).toEqual([
      expect.objectContaining({
        slug,
        isPubliclyListable: true,
        weeklyForkCount: 1,
        weeklyViewCount: 2,
        forkCount: 1,
        viewCount: 2,
      }),
    ])
  })

  it('starts the template-card ranking-count backfill through seed maintenance', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Backfill Author',
      'backfill-author@example.com'
    )
    const { templateId } = await seedAggregateTemplate(t, authorId)

    await t.run(async (ctx) =>
    {
      await ctx.db.insert('templateRankingAggregates', {
        templateId,
        criterionExternalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
        state: 'ready',
        activeGeneration: 1,
        bucketCount: 3,
        rankingCount: 5,
        itemCount: 3,
        computedAt: 1_000,
        staleAt: null,
        bucketSpread: [1, 2, 2],
        mostAgreedItemExternalId: null,
        mostAgreedItemLabel: null,
        mostDivisiveItemExternalId: null,
        mostDivisiveItemLabel: null,
        updatedAt: 1_000,
      })
    })
    const before = await t.run(
      async (ctx) =>
        await ctx.db
          .query('templateCards')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .unique()
    )
    expect(before?.rankingCount).toBe(0)

    const response = await withSeedEnv(SEED_SECRET, () =>
      t.fetch(BACKFILL_RANKING_COUNT_ROUTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SEED_SECRET}`,
        },
        body: JSON.stringify({}),
      })
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'success',
      value: { processed: 1, isDone: true },
    })

    const after = await t.run(
      async (ctx) =>
        await ctx.db
          .query('templateCards')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .unique()
    )
    expect(after?.rankingCount).toBe(5)
  })

  it('continues aggregate parent cleanup after bounded parent pages', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const authorId = await seedUser(
        t,
        'Aggregate Cleanup Author',
        'aggregate-cleanup@example.com'
      )
      const { templateId } = await seedAggregateTemplate(t, authorId)
      await t.run(async (ctx) =>
      {
        await Promise.all(
          Array.from({ length: 260 }, async (_, index) =>
          {
            const criterionExternalId = `legacy-${index}`
            await ctx.db.insert('templateRankingAggregates', {
              templateId,
              criterionExternalId,
              state: 'ready',
              activeGeneration: 1,
              bucketCount: 3,
              rankingCount: 1,
              itemCount: 0,
              computedAt: 1_000,
              staleAt: null,
              bucketSpread: [1, 0, 0],
              mostAgreedItemExternalId: null,
              mostAgreedItemLabel: null,
              mostDivisiveItemExternalId: null,
              mostDivisiveItemLabel: null,
              updatedAt: 1_000 + index,
            })
            await ctx.db.insert('templateRankingAggregateJobs', {
              templateId,
              criterionExternalId,
              status: 'queued',
              admittedAt: null,
              phase: 'seedItems',
              generation: 1,
              bucketCount: 3,
              targetBucketLabels: ['Top', 'Middle', 'Bottom'],
              itemCount: 0,
              rankingCount: 1,
              publicRankingCount: 1,
              templateCursor: null,
              rankingCursor: null,
              rankingScanDone: false,
              activeRankingId: null,
              activeRankingTierBucketMap: null,
              activeRankingItemCursor: null,
              bucketSpread: [1, 0, 0],
              restartRequestedAt: null,
              retryCount: 0,
              lastError: null,
              failedAt: null,
              createdAt: 1_000 + index,
              updatedAt: 1_000 + index,
            })
          })
        )
      })

      await t.mutation(
        internal.marketplace.rankings.aggregate.jobs
          .deleteTemplateRankingAggregateParentRowBatch,
        {
          templateId,
          phase: 'aggregates',
          cursor: null,
          rollupOnComplete: false,
        }
      )
      await runScheduled(t)

      const remaining = await t.run(async (ctx) => ({
        aggregates: await ctx.db
          .query('templateRankingAggregates')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .collect(),
        jobs: await ctx.db
          .query('templateRankingAggregateJobs')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .collect(),
      }))
      expect(remaining.aggregates).toEqual([])
      expect(remaining.jobs).toEqual([])
    }))

  it('wipes template and forked-board children in bounded batches', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Seed Wipe Author',
      'seed-wipe-author@example.com'
    )
    const seeded = await t.run(async (ctx) =>
    {
      const now = 1_700_000_000_000
      const templateId = await seedPublishedTemplate(ctx, {
        authorId,
        slug: 'seed-wipe-template',
        title: 'Seed Wipe Template',
        itemCount: 260,
        sizeClass: 'large',
        now,
      })
      await Promise.all([
        ...Array.from(
          { length: 260 },
          async (_, index) =>
            await ctx.db.insert('templateItems', {
              templateId,
              externalId: `seed-wipe-item-${index}`,
              label: `Seed Wipe Item ${index}`,
              backgroundColor: null,
              altText: null,
              mediaAssetId: null,
              order: index,
              aspectRatio: null,
              imageFit: null,
              transform: null,
              imagePadding: null,
            })
        ),
        ...Array.from(
          { length: 260 },
          async (_, index) =>
            await ctx.db.insert('templateTags', {
              templateId,
              tag: `tag-${index}`,
              category: 'gaming',
              isPubliclyListable: true,
              updatedAt: now,
            })
        ),
      ])

      const forkedBoardId = await seedCloudBoard(ctx, {
        ownerId: authorId,
        externalId: 'board-seed-wipe-fork',
        title: 'Seed Wipe Fork',
        sourceTemplateId: templateId,
        sourceTemplateCategory: 'gaming',
        sourceTemplateSizeClass: 'large',
        activeItemCount: 260,
        unrankedItemCount: 0,
        templateProgressState: 'complete',
        now,
      })
      const tierId = await ctx.db.insert('boardTiers', {
        boardId: forkedBoardId,
        externalId: 'tier-seed-wipe',
        name: 'Seed Wipe Tier',
        colorSpec: { kind: 'palette', index: 0 },
        order: 0,
      })
      await Promise.all(
        Array.from(
          { length: 260 },
          async (_, index) =>
            await ctx.db.insert('boardItems', {
              boardId: forkedBoardId,
              tierId,
              externalId: `board-seed-wipe-item-${index}`,
              label: `Board Seed Wipe Item ${index}`,
              mediaAssetId: null,
              order: index,
              deletedAt: null,
            })
        )
      )
      const keptBoardIds = await Promise.all(
        Array.from(
          { length: 3 },
          async (_, index) =>
            await seedCloudBoard(ctx, {
              ownerId: authorId,
              externalId: `board-plain-${index}`,
              title: `Plain Board ${index}`,
              now,
            })
        )
      )
      await ctx.db.insert('marketplaceStats', {
        key: 'templates',
        publicTemplateCount: 1,
        publicTemplateCountByCategory: {},
        updatedAt: now,
      })

      return { templateId, forkedBoardId, keptBoardIds }
    })

    await expect(
      t.action(internal.marketplace.templates.seed.wipeSeededDataBatch, {})
    ).resolves.toEqual({
      templatesDeleted: 1,
      itemsDeleted: 260,
      tagsDeleted: 260,
      cardsDeleted: 1,
      statsDeleted: 1,
      boardsDeleted: 1,
      boardItemsDeleted: 260,
      boardTiersDeleted: 1,
      marketplaceStatsCleared: true,
    })

    const remaining = await t.run(async (ctx) => ({
      template: await ctx.db.get(seeded.templateId),
      templateItems: await ctx.db
        .query('templateItems')
        .withIndex('byTemplate', (q) => q.eq('templateId', seeded.templateId))
        .take(1),
      templateTags: await ctx.db
        .query('templateTags')
        .withIndex('byTemplate', (q) => q.eq('templateId', seeded.templateId))
        .take(1),
      templateCard: await ctx.db
        .query('templateCards')
        .withIndex('byTemplateId', (q) => q.eq('templateId', seeded.templateId))
        .unique(),
      templateStats: await ctx.db
        .query('templateStats')
        .withIndex('byTemplateId', (q) => q.eq('templateId', seeded.templateId))
        .unique(),
      forkedBoard: await ctx.db.get(seeded.forkedBoardId),
      forkedBoardItems: await ctx.db
        .query('boardItems')
        .withIndex('byBoardAndTier', (q) =>
          q.eq('boardId', seeded.forkedBoardId)
        )
        .take(1),
      forkedBoardTiers: await ctx.db
        .query('boardTiers')
        .withIndex('byBoard', (q) => q.eq('boardId', seeded.forkedBoardId))
        .take(1),
      marketplaceStats: await ctx.db
        .query('marketplaceStats')
        .withIndex('byKey', (q) => q.eq('key', 'templates'))
        .unique(),
      keptBoards: await Promise.all(
        seeded.keptBoardIds.map(async (boardId) => await ctx.db.get(boardId))
      ),
    }))

    expect(remaining.template).toBeNull()
    expect(remaining.templateItems).toEqual([])
    expect(remaining.templateTags).toEqual([])
    expect(remaining.templateCard).toBeNull()
    expect(remaining.templateStats).toBeNull()
    expect(remaining.forkedBoard).toBeNull()
    expect(remaining.forkedBoardItems).toEqual([])
    expect(remaining.forkedBoardTiers).toEqual([])
    expect(remaining.marketplaceStats).toBeNull()
    expect(remaining.keptBoards.every(Boolean)).toBe(true)
  })

  it('clones a template w/ user preset & propagates layout settings + transforms', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const consumerId = await seedUser(t, 'Consumer', 'consumer@example.com')
    const transform: ItemTransform = {
      rotation: 0,
      zoom: 1.25,
      offsetX: 0.1,
      offsetY: -0.2,
    }
    const labels: BoardLabelSettings = {
      show: true,
      placement: { mode: 'captionBelow' },
      fontSizePx: 18,
    }
    await seedSourceBoard(t, authorId, {
      itemAspectRatio: 16 / 9,
      itemAspectRatioMode: 'manual',
      defaultItemImageFit: 'contain',
      defaultItemImagePadding: 0.08,
      imageItemFit: null,
      imageItemPadding: 0.18,
      imageItemTransform: transform,
      imageItemMediaPlate: 'dark',
      labels,
    })
    const presetExternalId = await seedTierPreset(t, consumerId)

    const { slug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Cloneable Template',
        category: 'sports',
        tags: ['draft'],
        visibility: 'public',
      }
    )

    const result = await asUser(t, consumerId).mutation(
      api.marketplace.templates.mutations.useTemplate,
      {
        slug,
        title: 'My Ranking',
        tierSelection: { kind: 'preset', presetExternalId },
      }
    )

    const board = await asUser(t, consumerId).query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: result.boardExternalId }
    )
    expect(board?.title).toBe('My Ranking')
    expect(board?.tiers.map((t) => t.name)).toEqual(['Keep', 'Skip'])
    expect(board?.items).toHaveLength(2)
    expect(board?.items.every((i) => i.tierId === null)).toBe(true)
    expect(board).toMatchObject({
      itemAspectRatio: 16 / 9,
      itemAspectRatioMode: 'manual',
      defaultItemImageFit: 'contain',
      defaultItemImagePadding: 0.08,
    })
    expect(board?.labels).toEqual(labels)
    expect(board?.items[0]).toMatchObject({
      label: 'Image item',
      mediaContentHash: 'hash-source',
      mediaPlate: 'dark',
      transform,
      imagePadding: 0.18,
      sourceTemplateItemExternalId: 'source-item-1',
    })
    const libraryRows = await asUser(t, consumerId).query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(libraryRows[0]).toMatchObject({
      externalId: result.boardExternalId,
      category: 'sports',
      sourceTemplateSizeClass: 'standard',
    })

    const popular = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { sort: 'popular' }
    )
    expect(popular.items[0]).toMatchObject({ slug, forkCount: 1 })
    const storedCounts = await t.run(async (ctx) =>
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySlug', (q) => q.eq('slug', slug))
        .unique()
      if (!template) throw new Error('template missing')
      const [stats, card] = await Promise.all([
        ctx.db
          .query('templateStats')
          .withIndex('byTemplateId', (q) => q.eq('templateId', template._id))
          .unique(),
        ctx.db
          .query('templateCards')
          .withIndex('byTemplateId', (q) => q.eq('templateId', template._id))
          .unique(),
      ])
      return { stats, card }
    })
    expect(storedCounts.stats).toMatchObject({
      forkCount: 1,
      viewCount: 0,
    })
    expect(storedCounts.card).toMatchObject({ forkCount: 1, viewCount: 0 })
  })

  it('publishes completed template rankings into queryable surfaces', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const rankerId = await seedUser(t, 'Ranker', 'ranker@example.com')
    await seedSourceBoard(t, authorId, { imageItemMediaPlate: 'light' })

    const { slug: templateSlug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Ranking Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )
    expect(
      await asUser(t, authorId).query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId: 'board-source' }
      )
    ).toMatchObject({
      canPublish: false,
      reason: 'not_template_backed',
    })
    const { ranker, boardExternalId } = await completeTemplateRankingBoard(
      t,
      rankerId,
      templateSlug,
      'Finished Ranking',
      async ({ ranker, boardExternalId }) =>
      {
        await expect(
          ranker.query(
            api.marketplace.rankings.public.queries
              .getBoardRankingPublishAvailability,
            { boardExternalId }
          )
        ).resolves.toMatchObject({
          canPublish: false,
          reason: 'incomplete',
          activeItemCount: 2,
          unrankedItemCount: 2,
          sourceTemplateTitle: 'Ranking Template',
        })
      }
    )
    await expect(
      ranker.query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId }
      )
    ).resolves.toMatchObject({
      canPublish: true,
      reason: null,
      activeItemCount: 2,
      unrankedItemCount: 0,
      sourceTemplateTitle: 'Ranking Template',
    })

    const beforePublishRows = await ranker.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(
      beforePublishRows.find((row) => row.externalId === boardExternalId)
    ).toMatchObject({
      publishState: 'wip',
      visibility: 'private',
    })

    const published = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Published Ranking',
        visibility: 'public',
      }
    )
    const storedLiveRankingSlug = await t.run(async (ctx) =>
    {
      const board = await ctx.db
        .query('boards')
        .withIndex('byOwnerAndExternalId', (q) =>
          q.eq('ownerId', rankerId).eq('externalId', boardExternalId)
        )
        .unique()
      if (!board?.livePublicRankingId) return null
      const ranking = await ctx.db.get(board.livePublicRankingId)
      return ranking?.slug ?? null
    })
    expect(storedLiveRankingSlug).toBe(published.slug)

    const afterPublishRows = await ranker.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(
      afterPublishRows.find((row) => row.externalId === boardExternalId)
    ).toMatchObject({
      publishState: 'live',
      visibility: 'public',
    })

    const detail = await t.query(
      api.marketplace.rankings.public.queries.getRankingBySlug,
      { slug: published.slug }
    )
    expect(detail).toMatchObject({
      slug: published.slug,
      title: 'Published Ranking',
      template: { slug: templateSlug, title: 'Ranking Template' },
      criterion: {
        externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
        name: DEFAULT_TEMPLATE_CRITERION_NAME,
        prompt: DEFAULT_TEMPLATE_CRITERION_PROMPT,
      },
      itemCount: 2,
      tierCount: 1,
    })
    expect(detail?.items.every((item) => item.tierExternalId !== null)).toBe(
      true
    )
    expect(
      detail?.items.find(
        (item) => item.templateItemExternalId === 'source-item-1'
      )?.mediaPlate
    ).toBe('light')

    await t.mutation(
      api.marketplace.rankings.public.mutations.recordRankingView,
      {
        slug: published.slug,
      }
    )
    await ranker.mutation(
      api.marketplace.rankings.public.mutations.recordRankingView,
      {
        slug: published.slug,
      }
    )

    const rankings = await t.query(
      api.marketplace.rankings.public.queries.getRankingsForTemplate,
      { templateSlug }
    )
    expect(rankings.items).toEqual([
      expect.objectContaining({
        slug: published.slug,
        criterion: expect.objectContaining({
          externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
        }),
        remixCount: 0,
        viewCount: 1,
      }),
    ])

    const myRanking = await ranker.query(
      api.marketplace.rankings.public.queries.getMyRankingForTemplate,
      { templateSlug }
    )
    expect(myRanking.ranking).toMatchObject({
      slug: published.slug,
      criterion: {
        externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
        name: DEFAULT_TEMPLATE_CRITERION_NAME,
        prompt: DEFAULT_TEMPLATE_CRITERION_PROMPT,
      },
    })
    expect(Object.keys(myRanking.placements).sort()).toEqual(
      detail!.items.map((item) => item.templateItemExternalId).sort()
    )
    expect(new Set(Object.values(myRanking.placements))).toEqual(new Set([0]))
  })

  it('clears an older board live ranking when another board supersedes its lane', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Supersede Author',
      'supersede-author@example.com'
    )
    const rankerId = await seedUser(
      t,
      'Supersede Ranker',
      'supersede-ranker@example.com'
    )
    await seedSourceBoard(t, authorId)

    const { slug: templateSlug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Supersede Ranking Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )

    const { ranker, boardExternalId: oldBoardExternalId } =
      await completeTemplateRankingBoard(
        t,
        rankerId,
        templateSlug,
        'Older Finished Ranking'
      )
    const { boardExternalId: replacementBoardExternalId } =
      await completeTemplateRankingBoard(
        t,
        rankerId,
        templateSlug,
        'Replacement Finished Ranking'
      )

    const oldRanking = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId: oldBoardExternalId,
        title: 'Older Public Ranking',
        visibility: 'public',
      }
    )
    const replacementRanking = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId: replacementBoardExternalId,
        title: 'Replacement Public Ranking',
        visibility: 'public',
      }
    )

    const stored = await t.run(async (ctx) =>
    {
      const [oldBoard, replacementBoard, oldRankingRow, replacementRankingRow] =
        await Promise.all([
          ctx.db
            .query('boards')
            .withIndex('byOwnerAndExternalId', (q) =>
              q.eq('ownerId', rankerId).eq('externalId', oldBoardExternalId)
            )
            .unique(),
          ctx.db
            .query('boards')
            .withIndex('byOwnerAndExternalId', (q) =>
              q
                .eq('ownerId', rankerId)
                .eq('externalId', replacementBoardExternalId)
            )
            .unique(),
          ctx.db
            .query('publishedRankings')
            .withIndex('bySlug', (q) => q.eq('slug', oldRanking.slug))
            .unique(),
          ctx.db
            .query('publishedRankings')
            .withIndex('bySlug', (q) => q.eq('slug', replacementRanking.slug))
            .unique(),
        ])

      return {
        oldBoardLivePublicRankingId: oldBoard?.livePublicRankingId ?? null,
        replacementBoardLivePublicRankingId:
          replacementBoard?.livePublicRankingId ?? null,
        oldRanking: oldRankingRow,
        replacementRanking: replacementRankingRow,
      }
    })

    expect(stored.oldBoardLivePublicRankingId).toBeNull()
    expect(stored.replacementBoardLivePublicRankingId).toBe(
      stored.replacementRanking?._id
    )
    expect(stored.oldRanking).toMatchObject({
      isPubliclyListable: false,
      supersededAt: expect.any(Number),
      supersededByRankingId: stored.replacementRanking?._id,
    })

    const libraryRows = await ranker.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(
      libraryRows.find((row) => row.externalId === oldBoardExternalId)
    ).toMatchObject({
      publishState: 'wip',
      visibility: 'private',
    })
    expect(
      libraryRows.find((row) => row.externalId === replacementBoardExternalId)
    ).toMatchObject({
      publishState: 'live',
      visibility: 'public',
    })
  })

  it('hides rankings when their source template is unpublished', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Unpublish Author',
      'unpublish-author@example.com'
    )
    const rankerId = await seedUser(
      t,
      'Unpublish Ranker',
      'unpublish-ranker@example.com'
    )
    const {
      templateId,
      itemIds,
      slug: templateSlug,
    } = await seedAggregateTemplate(t, authorId, {
      slug: 'UnpubTpl01',
      title: 'Unpublish Template',
    })
    const tiers = [{ externalId: 'top', name: 'Top', order: 0 }]
    const items = itemIds.map((templateItemId, index) => ({
      templateItemId,
      templateItemExternalId: `aggregate-item-${index}`,
      tierExternalId: 'top',
      externalId: `unpub-rank-item-${index}`,
      label: `Aggregate Item ${index}`,
      order: index,
    }))
    const rankingId = await seedAggregateRanking(t, {
      ownerId: rankerId,
      templateId,
      templateSlug,
      templateTitle: 'Unpublish Template',
      slug: 'UnpubRank1',
      title: 'Unpublish Ranking',
      now: 1_000,
      tiers,
      items,
    })
    await t.run(async (ctx) =>
    {
      const ranking = await ctx.db.get(rankingId)
      if (!ranking?.sourceBoardId)
      {
        throw new Error('Expected ranking source board')
      }
      await ctx.db.patch(ranking.sourceBoardId, {
        livePublicRankingId: rankingId,
      })
    })

    const beforeLibraryRows = await asUser(t, rankerId).query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(
      beforeLibraryRows.find((row) => row.externalId === 'UnpubRank1-board')
    ).toMatchObject({
      publishState: 'live',
      visibility: 'public',
    })

    await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: templateSlug }
    )

    await expect(
      t.query(api.marketplace.rankings.public.queries.getRankingBySlug, {
        slug: 'UnpubRank1',
      })
    ).resolves.toBeNull()
    await expect(
      t.query(api.marketplace.rankings.public.queries.getRankingsForTemplate, {
        templateSlug,
      })
    ).resolves.toEqual({ items: [] })
    await expect(
      t.query(api.marketplace.rankings.public.queries.listRankingsForTemplate, {
        templateSlug,
        paginationOpts: { cursor: null, numItems: 10 },
        sort: 'recent',
      })
    ).resolves.toMatchObject({ page: [] })

    const afterLibraryRows = await asUser(t, rankerId).query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(
      afterLibraryRows.find((row) => row.externalId === 'UnpubRank1-board')
    ).toMatchObject({
      publishState: 'wip',
      visibility: 'private',
    })
  })

  it('publishes rankings from locally-synced standard template forks', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Local Fork Author',
      'local-fork-author@example.com'
    )
    const rankerId = await seedUser(
      t,
      'Local Fork Ranker',
      'local-fork-ranker@example.com'
    )
    const { slug: templateSlug } = await seedAggregateTemplate(t, authorId, {
      criteria: TEST_CRITERIA,
      title: 'Local Fork Template',
    })
    const ranker = asUser(t, rankerId)

    await ranker.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-local-template-fork',
        baseRevision: null,
        title: 'Local Fork Ranking',
        sourceTemplateId: templateSlug,
        sourceTemplateTitle: 'Local Fork Template',
        preferredCriterionExternalId: 'favorites',
        tiers: [
          {
            externalId: 'tier-local-top',
            name: 'Top',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: ['local-item-0', 'local-item-1', 'local-item-2'],
          },
        ],
        items: [0, 1, 2].map((index) => ({
          externalId: `local-item-${index}`,
          tierId: 'tier-local-top',
          label: `Aggregate Item ${index}`,
          mediaExternalId: null,
          order: index,
          sourceTemplateItemExternalId: `aggregate-item-${index}`,
        })),
        deletedItemIds: [],
      }
    )

    await expect(
      ranker.query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId: 'board-local-template-fork' }
      )
    ).resolves.toMatchObject({
      canPublish: true,
      reason: null,
      activeItemCount: 3,
      unrankedItemCount: 0,
      sourceTemplateTitle: 'Local Fork Template',
      preferredCriterionExternalId: 'favorites',
    })

    const storedItems = await t.run(async (ctx) =>
    {
      const board = await ctx.db
        .query('boards')
        .withIndex('byOwnerAndExternalId', (q) =>
          q
            .eq('ownerId', rankerId)
            .eq('externalId', 'board-local-template-fork')
        )
        .unique()
      if (!board) throw new Error('local fork board missing')
      return await ctx.db
        .query('boardItems')
        .withIndex('byBoardAndTemplateItem', (q) => q.eq('boardId', board._id))
        .take(10)
    })
    expect(storedItems).toHaveLength(3)
    expect(storedItems.every((item) => item.templateItemId !== undefined)).toBe(
      true
    )

    const published = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId: 'board-local-template-fork',
        title: 'Published Local Fork Ranking',
        visibility: 'public',
        criterionExternalId: 'favorites',
      }
    )
    const detail = await t.query(
      api.marketplace.rankings.public.queries.getRankingBySlug,
      { slug: published.slug }
    )
    expect(detail).toMatchObject({
      slug: published.slug,
      template: { slug: templateSlug, title: 'Local Fork Template' },
      criterion: { externalId: 'favorites' },
      itemCount: 3,
    })
  })

  it('scopes ranking publish, query, and aggregate queues by criterion', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Criterion Author',
      'criterion-author@example.com'
    )
    const rankerId = await seedUser(
      t,
      'Criterion Ranker',
      'criterion-ranker@example.com'
    )
    await seedSourceBoard(t, authorId)

    const { slug: templateSlug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Criterion Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )
    await setTemplateCriteria(t, templateSlug)

    const { ranker, boardExternalId, sortedItems } =
      await completeTemplateRankingBoard(
        t,
        rankerId,
        templateSlug,
        'Finished Criterion Ranking'
      )

    await expect(
      ranker.query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId }
      )
    ).resolves.toMatchObject({
      canPublish: true,
      reason: null,
      sourceTemplateTitle: 'Criterion Template',
    })
    await expect(
      ranker.query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId, criterionExternalId: 'favorites' }
      )
    ).resolves.toMatchObject({
      canPublish: true,
      reason: null,
      sourceTemplateTitle: 'Criterion Template',
    })
    await expect(
      ranker.query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId, criterionExternalId: 'missing' }
      )
    ).resolves.toMatchObject({
      canPublish: false,
      reason: 'criterion_not_found',
    })
    await expect(
      ranker.query(
        api.marketplace.rankings.public.queries
          .getBoardRankingPublishAvailability,
        { boardExternalId, criterionExternalId: 'staged' }
      )
    ).resolves.toMatchObject({
      canPublish: false,
      reason: 'criterion_not_publishable',
    })

    const defaultCompetitive = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Default Competitive Ranking',
        visibility: 'public',
      }
    )
    const favorites = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Favorites Ranking',
        visibility: 'public',
        criterionExternalId: 'favorites',
      }
    )
    const replacementCompetitive = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Replacement Competitive Ranking',
        visibility: 'public',
        criterionExternalId: 'competitive',
      }
    )
    const unlistedCompetitive = await ranker.mutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Unlisted Competitive Ranking',
        visibility: 'unlisted',
        criterionExternalId: 'competitive',
      }
    )

    await expectConvexCode(
      ranker.mutation(
        api.marketplace.rankings.public.mutations.publishRankingFromBoard,
        {
          boardExternalId,
          title: 'Hidden Criterion Ranking',
          visibility: 'public',
          criterionExternalId: 'staged',
        }
      ),
      CONVEX_ERROR_CODES.invalidInput
    )

    const favoritesDetail = await t.query(
      api.marketplace.rankings.public.queries.getRankingBySlug,
      { slug: favorites.slug }
    )
    expect(favoritesDetail).toMatchObject({
      slug: favorites.slug,
      criterion: {
        externalId: 'favorites',
        name: 'Favorites',
        prompt: 'Rank by personal preference.',
      },
    })

    await t.run(async (ctx) =>
    {
      const favoritesRow = await ctx.db
        .query('publishedRankings')
        .withIndex('bySlug', (q) => q.eq('slug', favorites.slug))
        .unique()
      const replacementRow = await ctx.db
        .query('publishedRankings')
        .withIndex('bySlug', (q) => q.eq('slug', replacementCompetitive.slug))
        .unique()
      if (!favoritesRow || !replacementRow)
      {
        throw new Error('Expected query ranking rows')
      }
      await ctx.db.patch(favoritesRow._id, {
        viewCount: 50,
        topScore: 50,
        isFeatured: true,
        featuredRank: 0,
        featuredBadge: 'editorial',
        updatedAt: 50,
      })
      await ctx.db.patch(replacementRow._id, {
        viewCount: 5,
        topScore: 5,
        updatedAt: 40,
      })
    })

    const publicRankings = await t.query(
      api.marketplace.rankings.public.queries.getRankingsForTemplate,
      { templateSlug }
    )
    // unlisted competitive publish supersedes the prior public competitive
    // ranking, so only the favorites criterion has a publicly listed ranking
    expect(publicRankings.items.map((item) => item.slug)).toEqual([
      favorites.slug,
    ])
    expect(publicRankings.items[0]?.criterion).toMatchObject({
      externalId: 'favorites',
      name: 'Favorites',
      prompt: 'Rank by personal preference.',
    })

    const favoritesPage = await t.query(
      api.marketplace.rankings.public.queries.listRankingsForTemplate,
      {
        templateSlug,
        criterionExternalId: 'favorites',
        paginationOpts: { cursor: null, numItems: 10 },
      }
    )
    expect(favoritesPage.page.map((item) => item.slug)).toEqual([
      favorites.slug,
    ])
    const competitiveTopPage = await t.query(
      api.marketplace.rankings.public.queries.listRankingsForTemplate,
      {
        templateSlug,
        criterionExternalId: 'competitive',
        sort: 'top',
        paginationOpts: { cursor: null, numItems: 10 },
      }
    )
    expect(competitiveTopPage.page.map((item) => item.slug)).toEqual([])
    const favoritesFeaturedPage = await t.query(
      api.marketplace.rankings.public.queries.listRankingsForTemplate,
      {
        templateSlug,
        criterionExternalId: 'favorites',
        sort: 'featured',
        paginationOpts: { cursor: null, numItems: 10 },
      }
    )
    expect(favoritesFeaturedPage.page.map((item) => item.slug)).toEqual([
      favorites.slug,
    ])
    const missingPage = await t.query(
      api.marketplace.rankings.public.queries.listRankingsForTemplate,
      {
        templateSlug,
        criterionExternalId: 'missing',
        paginationOpts: { cursor: null, numItems: 10 },
      }
    )
    expect(missingPage.page).toEqual([])

    const myDefaultRanking = await ranker.query(
      api.marketplace.rankings.public.queries.getMyRankingForTemplate,
      { templateSlug }
    )
    expect(myDefaultRanking.ranking).toMatchObject({
      slug: unlistedCompetitive.slug,
      visibility: 'unlisted',
      criterion: expect.objectContaining({ externalId: 'competitive' }),
    })
    expect(Object.keys(myDefaultRanking.placements)).toHaveLength(
      sortedItems.length
    )
    const myFavoritesRanking = await ranker.query(
      api.marketplace.rankings.public.queries.getMyRankingForTemplate,
      { templateSlug, criterionExternalId: 'favorites' }
    )
    expect(myFavoritesRanking.ranking).toMatchObject({
      slug: favorites.slug,
      criterion: expect.objectContaining({ externalId: 'favorites' }),
    })
    const myMissingRanking = await ranker.query(
      api.marketplace.rankings.public.queries.getMyRankingForTemplate,
      { templateSlug, criterionExternalId: 'missing' }
    )
    expect(myMissingRanking).toEqual({ ranking: null, placements: {} })

    const stored = await t.run(async (ctx) =>
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySlug', (q) => q.eq('slug', templateSlug))
        .unique()
      if (!template) throw new Error('Expected template')

      const rankings = await ctx.db
        .query('publishedRankings')
        .withIndex('byOwnerUpdatedAt', (q) => q.eq('ownerId', rankerId))
        .collect()
      const templateRankings = rankings.filter(
        (ranking) =>
          ranking.sourceTemplateId === template._id &&
          ranking.publicationState === 'published'
      )
      const aggregates = (
        await ctx.db.query('templateRankingAggregates').collect()
      )
        .filter((aggregate) => aggregate.templateId === template._id)
        .map((aggregate) => aggregate.criterionExternalId)
        .sort()
      const jobs = (
        await ctx.db.query('templateRankingAggregateJobs').collect()
      )
        .filter((job) => job.templateId === template._id)
        .map((job) => job.criterionExternalId)
        .sort()
      const board = await ctx.db
        .query('boards')
        .withIndex('byOwnerAndExternalId', (q) =>
          q.eq('ownerId', rankerId).eq('externalId', boardExternalId)
        )
        .unique()
      const liveRanking = board?.livePublicRankingId
        ? await ctx.db.get(board.livePublicRankingId)
        : null

      return {
        rankings: Object.fromEntries(
          templateRankings.map((ranking) => [
            ranking.slug,
            {
              id: ranking._id,
              criterionExternalId: ranking.sourceCriterionExternalId,
              visibility: ranking.visibility,
              isPubliclyListable: ranking.isPubliclyListable,
              supersededAt: ranking.supersededAt,
              supersededByRankingId: ranking.supersededByRankingId,
            },
          ])
        ),
        aggregates,
        jobs,
        liveRankingSlug: liveRanking?.slug ?? null,
      }
    })

    expect(stored.rankings[defaultCompetitive.slug]).toMatchObject({
      criterionExternalId: 'competitive',
      visibility: 'public',
      isPubliclyListable: false,
      supersededAt: expect.any(Number),
      supersededByRankingId: stored.rankings[replacementCompetitive.slug]?.id,
    })
    expect(stored.rankings[favorites.slug]).toMatchObject({
      criterionExternalId: 'favorites',
      visibility: 'public',
      isPubliclyListable: true,
      supersededAt: null,
      supersededByRankingId: null,
    })
    expect(stored.rankings[replacementCompetitive.slug]).toMatchObject({
      criterionExternalId: 'competitive',
      visibility: 'public',
      isPubliclyListable: false,
      supersededAt: expect.any(Number),
      supersededByRankingId: stored.rankings[unlistedCompetitive.slug]?.id,
    })
    expect(stored.rankings[unlistedCompetitive.slug]).toMatchObject({
      criterionExternalId: 'competitive',
      visibility: 'unlisted',
      isPubliclyListable: false,
      supersededAt: null,
      supersededByRankingId: null,
    })
    expect(stored.aggregates).toEqual(['competitive', 'favorites'])
    expect(stored.jobs).toEqual(['competitive', 'favorites'])
    // unlisted competitive publish cleared the board's live public pointer
    expect(stored.liveRankingSlug).toBeNull()
  })

  it('continues public ranking supersession after the first bounded page', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const ownerId = await seedUser(
        t,
        'Ranking Owner',
        'ranking-owner@example.com'
      )
      const templateId = await t.run(
        async (ctx) =>
          await seedPublishedTemplate(ctx, {
            authorId: ownerId,
            slug: 'paged-supersede-template',
            title: 'Paged Supersede Template',
            itemCount: 1,
            sizeClass: 'standard',
            now: 1_000,
          })
      )
      const replacementRankingId = await t.run(
        async (ctx) =>
          await seedPublishedRanking(ctx, {
            ownerId,
            slug: 'paged-supersede-replacement',
            sourceTemplateId: templateId,
            sourceBoardId: null,
            sourceTemplateSlug: 'paged-supersede-template',
            sourceTemplateTitle: 'Paged Supersede Template',
            title: 'Replacement',
            itemCount: 1,
            now: 2_000,
          })
      )
      await t.run(async (ctx) =>
      {
        await Promise.all(
          Array.from(
            { length: 260 },
            async (_, index) =>
              await seedPublishedRanking(ctx, {
                ownerId,
                slug: `paged-supersede-old-${index}`,
                sourceTemplateId: templateId,
                sourceBoardId: null,
                sourceTemplateSlug: 'paged-supersede-template',
                sourceTemplateTitle: 'Paged Supersede Template',
                title: `Old ${index}`,
                itemCount: 1,
                now: 1_100 + index,
              })
          )
        )
      })

      await t.mutation(
        internal.marketplace.rankings.public.mutations
          .supersedePublicRankingsInLaneBatch,
        {
          ownerId,
          templateId,
          criterionExternalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
          replacementRankingId,
          now: 3_000,
          cursor: null,
        }
      )
      await runScheduled(t)

      const rankings = await t.run(
        async (ctx) =>
          await ctx.db
            .query('publishedRankings')
            .withIndex('bySourceTemplateCriterionOwnerPublicCreatedAt', (q) =>
              q
                .eq('sourceTemplateId', templateId)
                .eq(
                  'sourceCriterionExternalId',
                  DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID
                )
                .eq('ownerId', ownerId)
                .eq('isPubliclyListable', false)
            )
            .collect()
      )
      expect(rankings).toHaveLength(260)

      const replacement = await t.run(
        async (ctx) => await ctx.db.get(replacementRankingId)
      )
      expect(replacement).toMatchObject({
        isPubliclyListable: true,
        supersededAt: null,
        supersededByRankingId: null,
      })
    }))

  it('admits aggregate recompute jobs through bounded running slots', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(
      t,
      'Aggregate Admission Author',
      'aggregate-admission-author@example.com'
    )
    const templates = []
    for (let index = 0; index < 4; index++)
    {
      templates.push(
        await seedAggregateTemplate(t, authorId, {
          slug: `AggAdm${index}`,
          criteria: TEST_CRITERIA,
        })
      )
    }

    for (const template of templates)
    {
      await t.mutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForCriterion,
        {
          templateId: template.templateId,
          criterionExternalId: 'competitive',
        }
      )
    }

    const before = await t.run(async (ctx) =>
    {
      const jobs = await ctx.db.query('templateRankingAggregateJobs').collect()
      await ctx.db.patch(jobs[0]._id, {
        status: 'running',
        admittedAt: null,
      })
      return jobs.map((job) => job.status).sort()
    })
    expect(before).toEqual(['queued', 'queued', 'queued', 'queued'])

    const demotion = await t.mutation(
      internal.marketplace.rankings.aggregate.jobs
        .admitQueuedTemplateRankingAggregateJobs,
      {}
    )
    expect(demotion).toMatchObject({
      admitted: 0,
      running: 0,
      queuedRemaining: 1,
    })

    const admission = await t.mutation(
      internal.marketplace.rankings.aggregate.jobs
        .admitQueuedTemplateRankingAggregateJobs,
      {}
    )

    const after = await t.run(async (ctx) =>
    {
      const jobs = await ctx.db.query('templateRankingAggregateJobs').collect()
      return jobs.map((job) => job.status).sort()
    })
    expect(admission).toMatchObject({
      admitted: 3,
      running: 3,
      queuedRemaining: 1,
    })
    expect(after).toEqual(['queued', 'running', 'running', 'running'])
  })

  it('recomputes and reads template ranking aggregates by criterion', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const authorId = await seedUser(
        t,
        'Aggregate Criteria Author',
        'aggregate-criteria-author@example.com'
      )
      const rankerAId = await seedUser(
        t,
        'Aggregate Criteria Ranker A',
        'aggregate-criteria-a@example.com'
      )
      const rankerBId = await seedUser(
        t,
        'Aggregate Criteria Ranker B',
        'aggregate-criteria-b@example.com'
      )
      const rankerCId = await seedUser(
        t,
        'Aggregate Criteria Ranker C',
        'aggregate-criteria-c@example.com'
      )
      const {
        templateId,
        itemIds,
        slug: templateSlug,
      } = await seedAggregateTemplate(t, authorId, {
        criteria: TEST_CRITERIA,
      })

      await seedAggregateRanking(t, {
        ownerId: rankerAId,
        templateId,
        templateSlug,
        templateTitle: 'Aggregate Template',
        slug: 'AggCrit001',
        title: 'Competitive Ranker A',
        now: 1_000,
        criterion: toCriterionSnapshot('competitive'),
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(
          itemIds,
          'criterion-ranking-item',
          [0, 2, 2]
        ),
      })
      await seedAggregateRanking(t, {
        ownerId: rankerBId,
        templateId,
        templateSlug,
        templateTitle: 'Aggregate Template',
        slug: 'AggCrit002',
        title: 'Competitive Ranker B',
        now: 2_000,
        criterion: toCriterionSnapshot('competitive'),
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(
          itemIds,
          'criterion-ranking-item',
          [0, 1, 2]
        ),
      })
      await seedAggregateRanking(t, {
        ownerId: rankerCId,
        templateId,
        templateSlug,
        templateTitle: 'Aggregate Template',
        slug: 'AggCrit003',
        title: 'Favorites Ranker C',
        now: 3_000,
        criterion: toCriterionSnapshot('favorites'),
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(
          itemIds,
          'criterion-ranking-item',
          [2, 0, 2]
        ),
      })

      vi.setSystemTime(10_000)
      await t.mutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForCriterion,
        { templateId, criterionExternalId: 'competitive' }
      )
      await runScheduled(t)
      await t.mutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForCriterion,
        { templateId, criterionExternalId: 'favorites' }
      )
      await runScheduled(t)

      const competitive = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug }
      )
      const favorites = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug, criterionExternalId: 'favorites' }
      )
      expect(competitive).toMatchObject({
        criterion: { externalId: 'competitive' },
        state: 'ready',
        rankingCount: 2,
        bucketSpread: [1, 1, 1],
      })
      expect(favorites).toMatchObject({
        criterion: { externalId: 'favorites' },
        state: 'ready',
        rankingCount: 1,
        bucketSpread: [1, 0, 2],
      })
      await expect(
        t.query(
          api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
          {
            templateSlug,
            criterionExternalId: 'missing',
          }
        )
      ).resolves.toBeNull()

      const competitiveGeneration = competitive?.activeGeneration
      const favoritesGeneration = favorites?.activeGeneration
      expect(competitiveGeneration).toEqual(expect.any(Number))
      expect(favoritesGeneration).toEqual(expect.any(Number))
      if (
        typeof competitiveGeneration !== 'number' ||
        typeof favoritesGeneration !== 'number'
      )
      {
        throw new Error('Expected aggregate generations')
      }

      const competitiveItems = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'competitive',
          generation: competitiveGeneration,
          sort: 'templateOrder',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(
        competitiveItems.page.map((row) => row.distribution.map((d) => d.count))
      ).toEqual([
        [2, 0, 0],
        [0, 1, 1],
        [0, 0, 2],
      ])
      expect(
        competitiveItems.page.find(
          (row) => row.templateItemExternalId === 'aggregate-item-1'
        )?.mediaPlate
      ).toBe('light')

      const remixUserId = await seedUser(
        t,
        'Aggregate Criteria Remix User',
        'aggregate-remix@example.com'
      )
      const remix = await asUser(t, remixUserId).mutation(
        api.marketplace.rankings.public.mutations.remixTemplateConsensus,
        {
          templateSlug,
          criterionExternalId: 'competitive',
          title: 'Consensus Remix',
        }
      )
      const remixBoard = await asUser(t, remixUserId).query(
        api.workspace.boards.queries.getBoardStateByExternalId,
        { boardExternalId: remix.boardExternalId }
      )
      expect(
        remixBoard?.items.find(
          (item) => item.sourceTemplateItemExternalId === 'aggregate-item-1'
        )?.mediaPlate
      ).toBe('light')

      const favoritesSearch = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'favorites',
          generation: favoritesGeneration,
          search: 'Aggregate Item 1',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(
        favoritesSearch.page.find(
          (row) => row.templateItemExternalId === 'aggregate-item-1'
        )
      ).toMatchObject({
        sampleCount: 1,
        topBucketIndex: 0,
      })

      vi.setSystemTime(20_000)
      await t.mutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForCriterion,
        { templateId, criterionExternalId: 'competitive' }
      )
      await runScheduled(t)

      const recomputedCompetitive = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug, criterionExternalId: 'competitive' }
      )
      const stableFavorites = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug, criterionExternalId: 'favorites' }
      )
      expect(recomputedCompetitive?.activeGeneration).not.toBe(
        competitiveGeneration
      )
      expect(stableFavorites?.activeGeneration).toBe(favoritesGeneration)

      const crossedItems = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'favorites',
          generation: recomputedCompetitive?.activeGeneration ?? 0,
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(crossedItems.page).toEqual([])
    }))

  it('finalizes relative controversy metrics per criterion lane', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const authorId = await seedUser(
        t,
        'Relative Metrics Author',
        'relative-metrics-author@example.com'
      )
      const rankerIds: Id<'users'>[] = []
      for (
        let index = 0;
        index < MIN_RANKINGS_FOR_CONTROVERSY_BADGES;
        index++
      )
      {
        rankerIds.push(
          await seedUser(
            t,
            `Relative Metrics Ranker ${index}`,
            `relative-metrics-${index}@example.com`
          )
        )
      }
      const criteria: MarketplaceTemplateCriterion[] = [
        ...TEST_CRITERIA.slice(0, 2),
        {
          externalId: 'consistency',
          name: 'Consistency',
          shortName: 'Cons',
          prompt: 'Rank by stable consensus.',
          axisTop: 'Most consistent',
          axisBottom: 'Least consistent',
          order: 2,
          isPrimary: false,
          status: 'active',
        },
      ]
      const {
        templateId,
        itemIds,
        slug: templateSlug,
      } = await seedAggregateTemplate(t, authorId, { criteria })

      for (let index = 0; index < rankerIds.length; index++)
      {
        await seedAggregateRanking(t, {
          ownerId: rankerIds[index],
          templateId,
          templateSlug,
          templateTitle: 'Aggregate Template',
          slug: `RelComp${String(index).padStart(3, '0')}`,
          title: `Competitive Relative ${index}`,
          now: 1_000 + index,
          criterion: toCriterionSnapshot('competitive'),
          tiers: STANDARD_AGGREGATE_TIERS,
          items: makeAggregateItemsForBuckets(itemIds, `comp-${index}-item`, [
            index < 5 ? 0 : 2,
            index < 6 ? 0 : 1,
            2,
          ]),
        })
        await seedAggregateRanking(t, {
          ownerId: rankerIds[index],
          templateId,
          templateSlug,
          templateTitle: 'Aggregate Template',
          slug: `RelCons${String(index).padStart(3, '0')}`,
          title: `Consistency Relative ${index}`,
          now: 2_000 + index,
          criterion: {
            externalId: 'consistency',
            name: 'Consistency',
            prompt: 'Rank by stable consensus.',
          },
          tiers: STANDARD_AGGREGATE_TIERS,
          items: makeAggregateItemsForBuckets(
            itemIds,
            `cons-${index}-item`,
            [0, 1, 2]
          ),
        })
      }
      for (let index = 0; index < 3; index++)
      {
        await seedAggregateRanking(t, {
          ownerId: rankerIds[index],
          templateId,
          templateSlug,
          templateTitle: 'Aggregate Template',
          slug: `RelFav${String(index).padStart(3, '0')}`,
          title: `Favorites Relative ${index}`,
          now: 3_000 + index,
          criterion: toCriterionSnapshot('favorites'),
          tiers: STANDARD_AGGREGATE_TIERS,
          items: makeAggregateItemsForBuckets(itemIds, `fav-${index}-item`, [
            index === 0 ? 0 : 2,
            0,
            1,
          ]),
        })
      }

      for (const criterionExternalId of [
        'competitive',
        'favorites',
        'consistency',
      ])
      {
        vi.setSystemTime(10_000)
        await t.mutation(
          internal.marketplace.rankings.aggregate.jobs
            .queueTemplateRankingAggregateRecomputeForCriterion,
          { templateId, criterionExternalId }
        )
        await runScheduled(t)
      }

      const competitive = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug, criterionExternalId: 'competitive' }
      )
      expect(competitive).toMatchObject({
        criterion: { externalId: 'competitive' },
        state: 'ready',
        rankingCount: MIN_RANKINGS_FOR_CONTROVERSY_BADGES,
        mostAgreed: {
          templateItemExternalId: 'aggregate-item-2',
          label: 'Aggregate Item 2',
        },
        mostDivisive: {
          templateItemExternalId: 'aggregate-item-0',
          label: 'Aggregate Item 0',
        },
      })
      const competitiveGeneration = competitive?.activeGeneration
      expect(competitiveGeneration).toEqual(expect.any(Number))
      if (typeof competitiveGeneration !== 'number')
      {
        throw new Error('Expected competitive aggregate generation')
      }

      const competitiveItems = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'competitive',
          generation: competitiveGeneration,
          sort: 'templateOrder',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      const [splitItem, mixedItem, agreedItem] = competitiveItems.page
      expect(splitItem).toMatchObject({
        templateItemExternalId: 'aggregate-item-0',
        isControversial: true,
        controversyScore: 1,
        controversyPercentile: 1,
        agreementPercentile: 0,
      })
      expect(mixedItem).toMatchObject({
        templateItemExternalId: 'aggregate-item-1',
        isControversial: false,
      })
      expect(mixedItem.controversyPercentile).toBeCloseTo(0.5)
      expect(agreedItem).toMatchObject({
        templateItemExternalId: 'aggregate-item-2',
        isControversial: false,
        controversyScore: 0,
        agreementPercentile: 1,
      })

      const competitiveControversial = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'competitive',
          generation: competitiveGeneration,
          band: 'controversial',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(
        competitiveControversial.page.map((row) => row.templateItemExternalId)
      ).toEqual(['aggregate-item-0'])

      const favorites = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug, criterionExternalId: 'favorites' }
      )
      expect(favorites).toMatchObject({
        criterion: { externalId: 'favorites' },
        state: 'ready',
        rankingCount: 3,
        mostAgreed: null,
        mostDivisive: null,
      })
      const favoritesGeneration = favorites?.activeGeneration
      expect(favoritesGeneration).toEqual(expect.any(Number))
      if (typeof favoritesGeneration !== 'number')
      {
        throw new Error('Expected favorites aggregate generation')
      }
      const favoritesItems = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'favorites',
          generation: favoritesGeneration,
          sort: 'templateOrder',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(favoritesItems.page[0].controversyScore).toBeGreaterThan(0)
      expect(favoritesItems.page[0]).toMatchObject({
        isControversial: false,
        controversyPercentile: 1,
      })
      const favoritesControversial = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'favorites',
          generation: favoritesGeneration,
          band: 'controversial',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(favoritesControversial.page).toEqual([])

      const consistency = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug, criterionExternalId: 'consistency' }
      )
      expect(consistency).toMatchObject({
        criterion: { externalId: 'consistency' },
        state: 'ready',
        rankingCount: MIN_RANKINGS_FOR_CONTROVERSY_BADGES,
      })
      const consistencyGeneration = consistency?.activeGeneration
      expect(consistencyGeneration).toEqual(expect.any(Number))
      if (typeof consistencyGeneration !== 'number')
      {
        throw new Error('Expected consistency aggregate generation')
      }
      const consistencyItems = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug,
          criterionExternalId: 'consistency',
          generation: consistencyGeneration,
          sort: 'templateOrder',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(consistencyItems.page.map((row) => row.controversyScore)).toEqual([
        0, 0, 0,
      ])
      expect(
        Math.max(
          ...consistencyItems.page.map((row) => row.controversyPercentile)
        )
      ).toBeLessThan(CONTROVERSY_PERCENTILE_MIN)
    }))

  it('recomputes template ranking aggregates from latest public rankings per user', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const authorId = await seedUser(
        t,
        'Template Author',
        'author@example.com'
      )
      const rankerAId = await seedUser(t, 'Ranker A', 'ranker-a@example.com')
      const rankerBId = await seedUser(t, 'Ranker B', 'ranker-b@example.com')
      const rankerCId = await seedUser(t, 'Ranker C', 'ranker-c@example.com')
      const rankerDId = await seedUser(t, 'Ranker D', 'ranker-d@example.com')
      const rankerEId = await seedUser(t, 'Ranker E', 'ranker-e@example.com')
      const rankerFId = await seedUser(t, 'Ranker F', 'ranker-f@example.com')
      const { templateId, itemIds } = await seedAggregateTemplate(t, authorId)
      const otherTemplateId = await t.run(
        async (ctx) =>
          await seedPublishedTemplate(ctx, {
            slug: 'OtherAgg01',
            authorId,
            title: 'Other Aggregate Template',
            sizeClass: 'standard',
            itemCount: 1,
          })
      )
      const otherItemId = await t.run(
        async (ctx) =>
          await ctx.db.insert('templateItems', {
            templateId: otherTemplateId,
            externalId: 'other-item',
            label: 'Other Item',
            backgroundColor: null,
            altText: null,
            mediaAssetId: null,
            order: 0,
            aspectRatio: null,
            imageFit: null,
            transform: null,
            imagePadding: null,
          })
      )
      const wideTiers = Array.from({ length: 7 }, (_, index) => ({
        externalId: `wide-tier-${index}`,
        name: `Wide ${index}`,
        order: index,
      }))

      await seedAggregateRanking(t, {
        ownerId: rankerAId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank001',
        title: 'Older Ranker A Ranking',
        now: 1_000,
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(itemIds, 'ranking-item', [2, 1, 0]),
      })
      await seedAggregateRanking(t, {
        ownerId: rankerAId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank002',
        title: 'Latest Ranker A Ranking',
        now: 2_000,
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(itemIds, 'ranking-item', [0, 0, 1]),
      })
      vi.setSystemTime(5_000)
      await asUser(t, rankerAId).mutation(
        api.marketplace.rankings.public.mutations.recordRankingView,
        {
          slug: 'AggRank001',
        }
      )
      await seedAggregateRanking(t, {
        ownerId: rankerBId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank003',
        title: 'Ranker B Ranking',
        now: 1_500,
        tiers: [
          { externalId: 'love', name: 'Love', order: 0 },
          { externalId: 'fine', name: 'Fine', order: 1 },
          { externalId: 'nope', name: 'Nope', order: 2 },
        ],
        items: [
          makeAggregateItem(itemIds, 0, 'fine'),
          makeAggregateItem(itemIds, 1, 'nope'),
          makeAggregateItem(itemIds, 2, 'nope'),
        ],
      })
      await seedAggregateRanking(t, {
        ownerId: rankerCId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank004',
        title: 'Unlisted Ranking',
        now: 3_000,
        visibility: 'unlisted',
        isPubliclyListable: false,
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(itemIds, 'ranking-item', [2, 2, 2]),
      })
      await seedAggregateRanking(t, {
        ownerId: rankerDId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank005',
        title: 'Unpublished Ranking',
        now: 3_500,
        publicationState: 'unpublished',
        isPubliclyListable: true,
        tiers: STANDARD_AGGREGATE_TIERS,
        items: makeAggregateItemsForBuckets(itemIds, 'ranking-item', [2, 2, 2]),
      })
      await seedAggregateRanking(t, {
        ownerId: rankerEId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank006',
        title: 'Partially Corrupt Ranking',
        now: 4_000,
        tiers: STANDARD_AGGREGATE_TIERS,
        items: [
          makeAggregateItem(itemIds, 0, 'tier-top'),
          makeAggregateItem(itemIds, 1, 'missing-tier'),
          {
            templateItemId: otherItemId,
            templateItemExternalId: 'other-item',
            tierExternalId: 'tier-low',
            externalId: 'ranking-item-other',
            label: 'Other Item',
            order: 2,
          },
        ],
      })
      await seedAggregateRanking(t, {
        ownerId: rankerFId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank007',
        title: 'Ranker F Wide-Tier Ranking',
        now: 4_500,
        tiers: wideTiers,
        items: [
          makeAggregateItem(itemIds, 0, 'wide-tier-0'),
          makeAggregateItem(itemIds, 1, 'wide-tier-6'),
          makeAggregateItem(itemIds, 2, 'wide-tier-6'),
        ],
      })

      await t.mutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForTemplate,
        { templateId }
      )
      await runScheduled(t)

      const aggregate = await t.query(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        { templateSlug: 'AggTpl0001' }
      )
      expect(aggregate).toMatchObject({
        criterion: {
          externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
          name: DEFAULT_TEMPLATE_CRITERION_NAME,
          prompt: DEFAULT_TEMPLATE_CRITERION_PROMPT,
        },
        state: 'ready',
        bucketCount: 3,
        rankingCount: 4,
        itemCount: 3,
        buckets: [
          expect.objectContaining({ index: 0, label: 'S' }),
          expect.objectContaining({ index: 1, label: 'A' }),
          expect.objectContaining({ index: 2, label: 'B' }),
        ],
        bucketSpread: [1, 0, 2],
      })
      const activeGeneration = aggregate?.activeGeneration
      expect(activeGeneration).toEqual(expect.any(Number))
      if (typeof activeGeneration !== 'number')
      {
        throw new Error('Expected aggregate generation')
      }

      const items = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug: 'AggTpl0001',
          generation: activeGeneration,
          sort: 'templateOrder',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(items.page.map((row) => row.sampleCount)).toEqual([4, 3, 3])
      expect(
        items.page.map((row) => row.distribution.map((d) => d.count))
      ).toEqual([
        [3, 1, 0],
        [1, 0, 2],
        [0, 1, 2],
      ])
      expect(items.page[0]).toMatchObject({
        averageBucket: 1 / 4,
        topBucketIndex: 0,
        consensusScore: 3 / 4,
      })

      const byConsensus = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug: 'AggTpl0001',
          generation: activeGeneration,
          sort: 'consensus',
          paginationOpts: { cursor: null, numItems: 1 },
        }
      )
      expect(byConsensus.page[0]).toMatchObject({
        templateItemExternalId: 'aggregate-item-0',
        consensusScore: 3 / 4,
      })
      const byTopConsensus = await t.query(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        {
          templateSlug: 'AggTpl0001',
          generation: activeGeneration,
          sort: 'consensusTop',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(
        byTopConsensus.page.map((row) => row.templateItemExternalId)
      ).toEqual(['aggregate-item-0'])
    }))
})
