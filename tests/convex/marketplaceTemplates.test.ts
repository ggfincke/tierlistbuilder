// tests/convex/marketplaceTemplates.test.ts
// Convex marketplace template publish, listing, clone, & draft progress

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  MAX_TEMPLATE_ITEM_PAGE_SIZE,
  isTemplateSlug,
  type MarketplaceTemplateCount,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
  DEFAULT_TEMPLATE_CRITERION_NAME,
  DEFAULT_TEMPLATE_CRITERION_PROMPT,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { isRankingSlug } from '@tierlistbuilder/contracts/marketplace/ranking'
import { MAX_STANDARD_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type {
  BoardLabelSettings,
  ImageFit,
  ItemAspectRatioMode,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardItemWire,
  CloudBoardState,
  CloudBoardStateItem,
  CloudBoardTierWire,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import schema from '../../convex/schema'
import {
  modules,
  seedCloudBoard,
  seedPublishedRanking,
  seedPublishedTemplate,
} from './convexTestHelpers'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
{
  const t = convexTest({ schema, modules, transactionLimits: true })
  rateLimiter.register(t)
  return t
}

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  name: string,
  email: string,
  plan: 'free' | 'plus' = 'free'
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name,
        displayName: name,
        email,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plan,
      })
  )

const asUser = (
  t: ReturnType<typeof convexTest<typeof schema>>,
  userId: Id<'users'>
) =>
  t.withIdentity({
    subject: `${userId}|test-session`,
    issuer: 'https://convex.test',
  })

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
  t: ReturnType<typeof convexTest<typeof schema>>
): Promise<MarketplaceTemplateCount> =>
  (await t.query(api.marketplace.templates.queries.getTemplatesGallery, {}))
    .templateCount

interface SeedSourceBoardOptions
{
  itemAspectRatio?: number
  itemAspectRatioMode?: ItemAspectRatioMode
  defaultItemImageFit?: ImageFit
  imageItemFit?: ImageFit | null
  imageItemTransform?: ItemTransform
  labels?: BoardLabelSettings
}

const seedSourceBoard = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>,
  options: SeedSourceBoardOptions = {}
): Promise<{ mediaExternalId: string }> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    )
    const mediaAssetId = await ctx.db.insert('mediaAssets', {
      ownerId,
      externalId: 'media-source',
      dedupeHash: 'hash-source',
      tileVariant: {
        storageId,
        width: 64,
        height: 64,
        byteSize: 3,
        mimeType: 'image/png',
        contentHash: 'hash-source',
      },
      createdAt: now,
    })
    await ctx.db.insert('mediaVariants', {
      mediaAssetId,
      kind: 'tile',
      storageId,
      width: 64,
      height: 64,
      byteSize: 3,
      mimeType: 'image/png',
      contentHash: 'hash-source',
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

const seedTierPreset = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
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
  tiers: AggregateRankingTierSeed[]
  items: AggregateRankingItemSeed[]
}

const seedAggregateRanking = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
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
        })
      )
    )
    return rankingId
  })

const seedAggregateTemplate = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  authorId: Id<'users'>
) =>
  await t.run(async (ctx) =>
  {
    const templateId = await seedPublishedTemplate(ctx, {
      slug: 'AggTpl0001',
      authorId,
      title: 'Aggregate Template',
      sizeClass: 'standard',
      itemCount: 3,
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
          altText: null,
          mediaAssetId: null,
          order: i,
          aspectRatio: null,
          imageFit: null,
          transform: null,
        })
      )
    }
    return { templateId, itemIds: items }
  })

const seedLargeSourceBoard = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
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
  t: ReturnType<typeof convexTest<typeof schema>>,
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
      })
    }
    return 'LargeTpl01'
  })

const seedLargeCompletedRankingBoard = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
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

const seedLargePublishedRanking = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>
): Promise<string> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const itemCount = MAX_STANDARD_CLOUD_BOARD_ITEMS + 1
    const templateId = await seedPublishedTemplate(ctx, {
      slug: 'LargeRemixT',
      authorId: ownerId,
      title: 'Large Remix Template',
      sizeClass: 'large',
      itemCount,
    })
    const boardId = await seedCloudBoard(ctx, {
      externalId: 'large-remix-source',
      ownerId,
      title: 'Large Remix Source',
      sourceTemplateId: templateId,
      sourceTemplateCategory: 'gaming',
      sourceTemplateSizeClass: 'large',
      now,
      activeItemCount: itemCount,
      unrankedItemCount: 0,
      templateProgressState: 'complete',
    })
    await seedPublishedRanking(ctx, {
      slug: 'LargeRank1',
      ownerId,
      sourceTemplateId: templateId,
      sourceBoardId: boardId,
      sourceTemplateSlug: 'LargeRemixT',
      sourceTemplateTitle: 'Large Remix Template',
      title: 'Large Published Ranking',
      itemCount,
      now,
    })
    return 'LargeRank1'
  })

const seedRankingMediaSnapshot = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>
): Promise<Id<'mediaAssets'>> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now() - 2 * 60 * 60 * 1000
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' })
    )
    const mediaAssetId = await ctx.db.insert('mediaAssets', {
      ownerId,
      externalId: 'ranking-media',
      dedupeHash: 'ranking-media-hash',
      tileVariant: {
        storageId,
        width: 64,
        height: 64,
        byteSize: 3,
        mimeType: 'image/png',
        contentHash: 'ranking-media-hash',
      },
      createdAt: now,
    })
    await ctx.db.insert('mediaVariants', {
      mediaAssetId,
      kind: 'tile',
      storageId,
      width: 64,
      height: 64,
      byteSize: 3,
      mimeType: 'image/png',
      contentHash: 'ranking-media-hash',
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
    })
    return mediaAssetId
  })

const expectConvexCode = async (
  promise: Promise<unknown>,
  code: string
): Promise<void> =>
{
  await expect(promise).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof ConvexError &&
      typeof error.data === 'object' &&
      error.data !== null &&
      'code' in error.data &&
      error.data.code === code
  )
}

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
  ...(item.altText !== undefined ? { altText: item.altText } : {}),
  ...(item.mediaExternalId !== undefined
    ? { mediaExternalId: item.mediaExternalId }
    : {}),
  order,
  ...(item.aspectRatio !== undefined ? { aspectRatio: item.aspectRatio } : {}),
  ...(item.imageFit !== undefined ? { imageFit: item.imageFit } : {}),
  ...(item.transform !== undefined ? { transform: item.transform } : {}),
})

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

    expect(isTemplateSlug(publicTemplate.slug)).toBe(true)
    expect(isTemplateSlug(unlistedTemplate.slug)).toBe(true)

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
    expect(gallery.popular.map((i) => i.title)).toEqual(['Public Template'])
    expect(gallery.recent.map((i) => i.title)).toEqual(['Public Template'])
    expect(gallery.results[0]).toMatchObject({ access: 'usable' })
    const galleryResults = await t.query(
      api.marketplace.templates.queries.getTemplateGalleryResults,
      {}
    )
    expect(galleryResults.templateCount).toEqual(gallery.templateCount)
    expect(galleryResults.results.map((i) => i.title)).toEqual([
      'Public Template',
    ])
    const popularRail = await t.query(
      api.marketplace.templates.queries.getTemplateGalleryRail,
      { rail: 'popular' }
    )
    expect(popularRail.items.map((i) => i.title)).toEqual(['Public Template'])

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
    expect(
      (
        await caller.query(api.workspace.boards.queries.getMyLibraryBoards, {})
      )[0]
    ).toMatchObject({
      visibility: 'public',
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
    expect(
      (
        await caller.query(api.workspace.boards.queries.getMyLibraryBoards, {})
      )[0]
    ).toMatchObject({
      visibility: 'public',
    })

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
    expect(
      (
        await caller.query(api.workspace.boards.queries.getMyLibraryBoards, {})
      )[0]
    ).toMatchObject({
      visibility: 'private',
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
  {
    vi.useFakeTimers()
    await withLargeTemplateJobsEnabled(async () =>
    {
      try
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

        await t.finishAllScheduledFunctions(() => vi.runAllTimers())

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
          status: 'syncing',
          sourceTemplateSizeClass: 'large',
        })

        await t.finishAllScheduledFunctions(() => vi.runAllTimers())

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
      }
      finally
      {
        vi.useRealTimers()
      }
    })
  })

  it('rejects large ranking publish and remix until ranking jobs exist', async () =>
  {
    const t = makeTest()
    const plusUserId = await seedUser(
      t,
      'Plus Ranker',
      'plus-ranker@example.com',
      'plus'
    )
    const freeUserId = await seedUser(
      t,
      'Free Remixer',
      'free-remixer@example.com'
    )
    const boardExternalId = await seedLargeCompletedRankingBoard(t, plusUserId)

    await expectConvexCode(
      asUser(t, plusUserId).mutation(
        api.marketplace.rankings.mutations.publishRankingFromBoard,
        {
          boardExternalId,
          title: 'Large Ranking',
          visibility: 'public',
        }
      ),
      CONVEX_ERROR_CODES.cloudItemLimitExceeded
    )

    const rankingSlug = await seedLargePublishedRanking(t, plusUserId)
    await expectConvexCode(
      asUser(t, freeUserId).mutation(
        api.marketplace.rankings.mutations.remixRanking,
        { slug: rankingSlug }
      ),
      CONVEX_ERROR_CODES.largeTemplateRequiresPlus
    )
    await withLargeTemplateJobsEnabled(async () =>
    {
      await expectConvexCode(
        asUser(t, plusUserId).mutation(
          api.marketplace.rankings.mutations.remixRanking,
          { slug: rankingSlug }
        ),
        CONVEX_ERROR_CODES.cloudItemLimitExceeded
      )
    })
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
  {
    vi.useFakeTimers()
    await withLargeTemplateJobsEnabled(async () =>
    {
      try
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
        await t.finishAllScheduledFunctions(() => vi.runAllTimers())
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
        await t.finishAllScheduledFunctions(() => vi.runAllTimers())

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
      }
      finally
      {
        vi.useRealTimers()
      }
    })
  })

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
      status: 'in_progress',
      visibility: 'private',
    })

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
      status: 'published',
      visibility: 'public',
    })

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
    await t.mutation(api.marketplace.templates.mutations.recordTemplateView, {
      slug,
    })
    await asUser(t, consumerId).mutation(
      api.marketplace.templates.mutations.useTemplate,
      { slug }
    )
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
      weeklyUseCount: 1,
      weeklyViewCount: 2,
      useCount: 1,
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
        weeklyUseCount: 1,
        weeklyViewCount: 2,
        useCount: 1,
        viewCount: 2,
      }),
    ])
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
      imageItemFit: null,
      imageItemTransform: transform,
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
    })
    expect(board?.labels).toEqual(labels)
    expect(board?.items[0]).toMatchObject({
      label: 'Image item',
      mediaContentHash: 'hash-source',
      transform,
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
    expect(popular.items[0]).toMatchObject({ slug, useCount: 1 })
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
      useCount: 1,
      viewCount: 0,
    })
    expect(storedCounts.card).toMatchObject({ useCount: 1, viewCount: 0 })
  })

  it('publishes completed template rankings and remixes them into ranked boards', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const rankerId = await seedUser(t, 'Ranker', 'ranker@example.com')
    const remixerId = await seedUser(t, 'Remixer', 'remixer@example.com')
    await seedSourceBoard(t, authorId)

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
        api.marketplace.rankings.queries.getBoardRankingPublishAvailability,
        { boardExternalId: 'board-source' }
      )
    ).toMatchObject({
      canPublish: false,
      reason: 'not_template_backed',
    })
    const ranker = asUser(t, rankerId)
    const { boardExternalId } = await ranker.mutation(
      api.marketplace.templates.mutations.useTemplate,
      { slug: templateSlug, title: 'Finished Ranking' }
    )
    const draft = await ranker.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId }
    )
    const sortedItems = draft!.items.slice().sort((a, b) => a.order - b.order)
    expect(
      await ranker.query(
        api.marketplace.rankings.queries.getBoardRankingPublishAvailability,
        { boardExternalId }
      )
    ).toMatchObject({
      canPublish: false,
      reason: 'incomplete',
      activeItemCount: 2,
      unrankedItemCount: 2,
      sourceTemplateTitle: 'Ranking Template',
    })
    await ranker.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId,
        baseRevision: draft!.revision,
        title: draft!.title,
        tiers: draft!.tiers.map((tier) =>
          toWireTier(
            tier,
            tier.externalId === draft!.tiers[0].externalId
              ? sortedItems.map((i) => i.externalId)
              : []
          )
        ),
        items: sortedItems.map((item, order) =>
          toWireItem(item, draft!.tiers[0].externalId, order)
        ),
        deletedItemIds: [],
      }
    )
    expect(
      await ranker.query(
        api.marketplace.rankings.queries.getBoardRankingPublishAvailability,
        { boardExternalId }
      )
    ).toMatchObject({
      canPublish: true,
      reason: null,
      activeItemCount: 2,
      unrankedItemCount: 0,
      sourceTemplateTitle: 'Ranking Template',
    })

    const published = await ranker.mutation(
      api.marketplace.rankings.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Published Ranking',
        visibility: 'public',
      }
    )
    expect(isRankingSlug(published.slug)).toBe(true)

    const templateDetail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug: templateSlug }
    )
    expect(templateDetail?.criteria).toEqual([
      expect.objectContaining({
        externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
        name: DEFAULT_TEMPLATE_CRITERION_NAME,
        prompt: DEFAULT_TEMPLATE_CRITERION_PROMPT,
        isPrimary: true,
        status: 'active',
      }),
    ])

    const detail = await t.query(
      api.marketplace.rankings.queries.getRankingBySlug,
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

    await t.mutation(api.marketplace.rankings.mutations.recordRankingView, {
      slug: published.slug,
    })
    const remixed = await asUser(t, remixerId).mutation(
      api.marketplace.rankings.mutations.remixRanking,
      { slug: published.slug, title: 'Remixed Ranking' }
    )
    const board = await asUser(t, remixerId).query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: remixed.boardExternalId }
    )
    expect(board).toMatchObject({ title: 'Remixed Ranking' })
    expect(board?.items).toHaveLength(2)
    expect(board?.items.every((item) => item.tierId !== null)).toBe(true)
    const libraryRows = await asUser(t, remixerId).query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(libraryRows[0]).toMatchObject({
      externalId: remixed.boardExternalId,
      category: 'gaming',
    })

    const rankings = await t.query(
      api.marketplace.rankings.queries.getRankingsForTemplate,
      { templateSlug }
    )
    expect(rankings.items).toEqual([
      expect.objectContaining({
        slug: published.slug,
        criterion: expect.objectContaining({
          externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
        }),
        remixCount: 1,
        viewCount: 1,
      }),
    ])

    const myRanking = await ranker.query(
      api.marketplace.rankings.queries.getMyRankingForTemplate,
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

    await t.run(async (ctx) =>
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySlug', (q) => q.eq('slug', templateSlug))
        .unique()
      if (!template) throw new Error('Expected template')
      const sourceBoardId = await seedCloudBoard(ctx, {
        externalId: 'top-ranking-board',
        ownerId: remixerId,
        title: 'Top Ranking Board',
        sourceTemplateId: template._id,
        sourceTemplateCategory: template.category,
        sourceTemplateSizeClass: template.sizeClass,
      })
      await seedPublishedRanking(ctx, {
        ownerId: remixerId,
        slug: 'TopRank001',
        sourceTemplateId: template._id,
        sourceBoardId,
        sourceTemplateSlug: templateSlug,
        sourceTemplateTitle: template.title,
        title: 'High Traffic Ranking',
        itemCount: 2,
        tierCount: 1,
        viewCount: 20,
        now: 1,
      })
    })

    const topRankings = await t.query(
      api.marketplace.rankings.queries.listRankingsForTemplate,
      {
        templateSlug,
        sort: 'top',
        paginationOpts: { cursor: null, numItems: 1 },
      }
    )
    expect(topRankings.page).toEqual([
      expect.objectContaining({ slug: 'TopRank001', viewCount: 20 }),
    ])
    expect(topRankings.isDone).toBe(false)

    expect(
      await ranker.query(
        api.marketplace.templates.bookmarks.getTemplateBookmarkState,
        { templateSlug }
      )
    ).toEqual({ saved: false, savedAt: null })
    const saved = await ranker.mutation(
      api.marketplace.templates.bookmarks.toggleTemplateBookmark,
      { templateSlug, saved: true }
    )
    expect(saved).toMatchObject({ saved: true, savedAt: expect.any(Number) })
    const bookmarkList = await ranker.query(
      api.marketplace.templates.bookmarks.listMyTemplateBookmarks,
      { paginationOpts: { cursor: null, numItems: 10 } }
    )
    expect(bookmarkList.page).toEqual([
      expect.objectContaining({
        template: expect.objectContaining({ slug: templateSlug }),
        savedAt: saved.savedAt,
      }),
    ])
    expect(
      await ranker.mutation(
        api.marketplace.templates.bookmarks.toggleTemplateBookmark,
        { templateSlug, saved: false }
      )
    ).toEqual({ saved: false, savedAt: null })
  })

  it('recomputes template ranking aggregates from latest public rankings per user', async () =>
  {
    vi.useFakeTimers()
    try
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
          })
      )
      const tiers = [
        { externalId: 'tier-top', name: 'Top', order: 0 },
        { externalId: 'tier-mid', name: 'Middle', order: 1 },
        { externalId: 'tier-low', name: 'Low', order: 2 },
      ]
      const wideTiers = Array.from({ length: 7 }, (_, index) => ({
        externalId: `wide-tier-${index}`,
        name: `Wide ${index}`,
        order: index,
      }))
      const item = (index: number, tierExternalId: string) => ({
        templateItemId: itemIds[index],
        templateItemExternalId: `aggregate-item-${index}`,
        tierExternalId,
        externalId: `ranking-item-${index}`,
        label: `Aggregate Item ${index}`,
        order: index,
      })

      await seedAggregateRanking(t, {
        ownerId: rankerAId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank001',
        title: 'Older Ranker A Ranking',
        now: 1_000,
        tiers,
        items: [item(0, 'tier-low'), item(1, 'tier-mid'), item(2, 'tier-top')],
      })
      await seedAggregateRanking(t, {
        ownerId: rankerAId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank002',
        title: 'Latest Ranker A Ranking',
        now: 2_000,
        tiers,
        items: [item(0, 'tier-top'), item(1, 'tier-top'), item(2, 'tier-mid')],
      })
      vi.setSystemTime(5_000)
      await t.mutation(api.marketplace.rankings.mutations.recordRankingView, {
        slug: 'AggRank001',
      })
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
        items: [item(0, 'fine'), item(1, 'nope'), item(2, 'nope')],
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
        tiers,
        items: [item(0, 'tier-low'), item(1, 'tier-low'), item(2, 'tier-low')],
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
        tiers,
        items: [item(0, 'tier-low'), item(1, 'tier-low'), item(2, 'tier-low')],
      })
      await seedAggregateRanking(t, {
        ownerId: rankerEId,
        templateId,
        templateSlug: 'AggTpl0001',
        templateTitle: 'Aggregate Template',
        slug: 'AggRank006',
        title: 'Partially Corrupt Ranking',
        now: 4_000,
        tiers,
        items: [
          item(0, 'tier-top'),
          item(1, 'missing-tier'),
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
          item(0, 'wide-tier-0'),
          item(1, 'wide-tier-6'),
          item(2, 'wide-tier-6'),
        ],
      })

      await t.mutation(
        internal.marketplace.rankings.aggregateInternal
          .queueTemplateRankingAggregateRecomputeForTemplate,
        { templateId }
      )
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const aggregate = await t.query(
        api.marketplace.rankings.queries.getTemplateRankingAggregate,
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
        api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
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
        api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
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
        api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
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
      const bottom = await t.query(
        api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
        {
          templateSlug: 'AggTpl0001',
          generation: activeGeneration,
          band: 'bottom',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(bottom.page).toEqual([])
      const searched = await t.query(
        api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
        {
          templateSlug: 'AggTpl0001',
          generation: activeGeneration,
          search: 'Aggregate Item 1',
          paginationOpts: { cursor: null, numItems: 10 },
        }
      )
      expect(searched.page.map((row) => row.templateItemExternalId)).toContain(
        'aggregate-item-1'
      )
    }
    finally
    {
      vi.useRealTimers()
    }
  })
})
