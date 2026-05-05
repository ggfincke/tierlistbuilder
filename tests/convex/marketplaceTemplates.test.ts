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
import { buildFreshBoardCloudFields } from '../../convex/workspace/boards/cloudFields'
import { modules, seedPublishedTemplate } from './convexTestHelpers'

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
    const boardId = await ctx.db.insert('boards', {
      externalId: 'board-source',
      ownerId,
      title: 'Source Board',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
      ...(options.itemAspectRatio !== undefined
        ? { itemAspectRatio: options.itemAspectRatio }
        : {}),
      ...(options.itemAspectRatioMode !== undefined
        ? { itemAspectRatioMode: options.itemAspectRatioMode }
        : {}),
      ...(options.defaultItemImageFit !== undefined
        ? { defaultItemImageFit: options.defaultItemImageFit }
        : {}),
      ...(options.labels !== undefined ? { labels: options.labels } : {}),
      sourceTemplateId: null,
      sourceTemplateCategory: null,
      sourceTemplateSizeClass: null,
      ...buildFreshBoardCloudFields(now),
      activeItemCount: 2,
      unrankedItemCount: 1,
      templateProgressState: 'none',
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

const seedLargeSourceBoard = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>,
  externalId: string
): Promise<void> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const boardId = await ctx.db.insert('boards', {
      externalId,
      ownerId,
      title: 'Large Source Board',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
      sourceTemplateId: null,
      sourceTemplateCategory: null,
      sourceTemplateSizeClass: null,
      ...buildFreshBoardCloudFields(now),
      activeItemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
      unrankedItemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
      templateProgressState: 'none',
      librarySummary: {
        coverItems: [],
        tierColors: [{ kind: 'palette', index: 0 }],
        tierBreakdown: [],
      },
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
    await seedSourceBoard(t, authorId)
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
      coverMedia: {
        externalId: 'media-source',
        width: 64,
        height: 64,
        contentHash: 'hash-source',
      },
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

  it('refreshes card author fields and search text from profile changes', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    const { slug } = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Author Search Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )

    await caller.mutation(api.users.updateProfile, {
      displayName: 'Renamed Author',
    })
    await t.mutation(
      internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
      { authorId, cursor: null }
    )

    const byAuthor = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { search: 'renamed' }
    )
    expect(byAuthor.items).toHaveLength(1)
    expect(byAuthor.items[0]).toMatchObject({
      slug,
      author: { displayName: 'Renamed Author' },
    })
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

  it('lists template drafts in progress & updates progress as items get ranked', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const consumerId = await seedUser(t, 'Consumer', 'consumer@example.com')
    await seedSourceBoard(t, authorId)

    const { slug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Draft Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )

    const consumer = asUser(t, consumerId)
    const { boardExternalId } = await consumer.mutation(
      api.marketplace.templates.mutations.useTemplate,
      { slug, title: 'My Draft' }
    )

    let drafts = await consumer.query(
      api.marketplace.templates.queries.getMyTemplateDrafts,
      {}
    )
    expect(drafts.drafts).toHaveLength(1)
    expect(drafts.drafts[0]).toMatchObject({
      boardExternalId,
      activeItemCount: 2,
      rankedItemCount: 0,
      progressPercent: 0,
    })

    const board = await consumer.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId }
    )
    const sortedItems = board!.items.slice().sort((a, b) => a.order - b.order)

    await consumer.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId,
        baseRevision: board!.revision,
        title: board!.title,
        tiers: board!.tiers.map((tier) =>
          toWireTier(
            tier,
            tier.externalId === board!.tiers[0].externalId
              ? sortedItems.map((i) => i.externalId)
              : []
          )
        ),
        items: sortedItems.map((item, order) =>
          toWireItem(item, board!.tiers[0].externalId, order)
        ),
        deletedItemIds: [],
      }
    )

    drafts = await consumer.query(
      api.marketplace.templates.queries.getMyTemplateDrafts,
      {}
    )
    expect(drafts.drafts).toEqual([])
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

    const published = await ranker.mutation(
      api.marketplace.rankings.mutations.publishRankingFromBoard,
      {
        boardExternalId,
        title: 'Published Ranking',
        visibility: 'public',
      }
    )
    expect(isRankingSlug(published.slug)).toBe(true)

    const detail = await t.query(
      api.marketplace.rankings.queries.getRankingBySlug,
      { slug: published.slug }
    )
    expect(detail).toMatchObject({
      slug: published.slug,
      title: 'Published Ranking',
      template: { slug: templateSlug, title: 'Ranking Template' },
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
        remixCount: 1,
        viewCount: 1,
      }),
    ])
  })
})
