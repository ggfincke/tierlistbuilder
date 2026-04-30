// tests/convex/marketplaceTemplates.test.ts
// Convex marketplace template publish, listing, & clone behavior

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
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
import { modules } from './convexTestHelpers'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
{
  const t = convexTest({ schema, modules, transactionLimits: true })
  rateLimiter.register(t)
  return t
}

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  name: string,
  email: string
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name,
        displayName: name,
        email,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tier: 'free',
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
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    )
    const mediaAssetId = await ctx.db.insert('mediaAssets', {
      ownerId,
      externalId: 'media-source',
      storageId,
      contentHash: 'hash-source',
      mimeType: 'image/png',
      width: 64,
      height: 64,
      byteSize: 3,
      createdAt: Date.now(),
    })
    const boardId = await ctx.db.insert('boards', {
      externalId: 'board-source',
      ownerId,
      title: 'Source Board',
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
      sourceMediaAssetId: null,
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
      sourceMediaAssetId: null,
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

const setTemplateUseCount = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  slug: string,
  useCount: number
): Promise<void> =>
{
  await t.run(async (ctx) =>
  {
    const template = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', slug))
      .unique()
    expect(template).not.toBeNull()
    await ctx.db.patch(template!._id, { useCount })
  })
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
  ...(item.sourceMediaExternalId !== undefined
    ? { sourceMediaExternalId: item.sourceMediaExternalId }
    : {}),
  order,
  ...(item.aspectRatio !== undefined ? { aspectRatio: item.aspectRatio } : {}),
  ...(item.imageFit !== undefined ? { imageFit: item.imageFit } : {}),
  ...(item.transform !== undefined ? { transform: item.transform } : {}),
})

describe('marketplace template Convex functions', () =>
{
  it('lists public templates while resolving unlisted templates by slug', async () =>
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
        description: 'A public template',
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
    expect(list.items.map((item) => item.title)).toEqual(['Public Template'])
    expect(list.items[0]).toMatchObject({
      category: 'gaming',
      tags: ['rpg', 'favorites'],
      itemCount: 2,
      visibility: 'public',
      unpublishedAt: null,
    })

    const unlistedDetail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug: unlistedTemplate.slug }
    )
    expect(unlistedDetail).toMatchObject({
      title: 'Unlisted Template',
      visibility: 'unlisted',
      itemCount: 2,
    })
    expect(unlistedDetail?.items.map((item) => item.externalId)).toEqual([
      'source-item-1',
      'source-item-2',
    ])
    expect(unlistedDetail?.coverMedia?.contentHash).toBe('hash-source')
  })

  it('projects library boards from summaries and indexed publish state', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    let boards = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )

    expect(boards).toHaveLength(1)
    expect(boards[0]).toMatchObject({
      title: 'Source Board',
      activeItemCount: 2,
      unrankedItemCount: 1,
      rankedItemCount: 1,
      status: 'in_progress',
      visibility: 'private',
      category: 'other',
      tierColors: [{ kind: 'palette', index: 1 }],
      tierBreakdown: [
        {
          tierIndex: 0,
          itemCount: 1,
          colorSpec: { kind: 'palette', index: 1 },
        },
      ],
      coverItems: [
        {
          label: 'Image item',
          externalId: 'source-item-1',
        },
        {
          label: 'Text item',
          externalId: 'source-item-2',
          mediaUrl: null,
        },
      ],
    })

    await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Public Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )
    boards = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )

    expect(boards[0]).toMatchObject({
      status: 'published',
      visibility: 'public',
    })
  })

  it('maintains the public template count without scanning templates', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    await expect(
      t.query(api.marketplace.templates.queries.getPublicTemplateCount, {})
    ).resolves.toEqual({
      count: 0,
      countByCategory: {},
    })

    const publicTemplate = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Public Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )

    await expect(
      t.query(api.marketplace.templates.queries.getPublicTemplateCount, {})
    ).resolves.toEqual({
      count: 1,
      countByCategory: { gaming: 1 },
    })

    const unlistedTemplate = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Unlisted Template',
        category: 'gaming',
        tags: [],
        visibility: 'unlisted',
      }
    )

    await expect(
      t.query(api.marketplace.templates.queries.getPublicTemplateCount, {})
    ).resolves.toEqual({
      count: 1,
      countByCategory: { gaming: 1 },
    })

    await caller.mutation(
      api.marketplace.templates.mutations.updateMyTemplateMeta,
      {
        slug: unlistedTemplate.slug,
        visibility: 'public',
        category: 'movies',
      }
    )

    await expect(
      t.query(api.marketplace.templates.queries.getPublicTemplateCount, {})
    ).resolves.toEqual({
      count: 2,
      countByCategory: { gaming: 1, movies: 1 },
    })

    await caller.mutation(
      api.marketplace.templates.mutations.updateMyTemplateMeta,
      {
        slug: publicTemplate.slug,
        visibility: 'unlisted',
      }
    )

    await expect(
      t.query(api.marketplace.templates.queries.getPublicTemplateCount, {})
    ).resolves.toEqual({
      count: 1,
      countByCategory: { movies: 1 },
    })

    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: unlistedTemplate.slug }
    )

    await expect(
      t.query(api.marketplace.templates.queries.getPublicTemplateCount, {})
    ).resolves.toEqual({
      count: 0,
      countByCategory: {},
    })
  })

  it('lists related templates from the same public category by popularity', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    const current = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Current Template',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )
    const relatedA = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Related A',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )
    const relatedB = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Related B',
        category: 'gaming',
        tags: [],
        visibility: 'public',
      }
    )
    const otherCategory = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Other Category',
        category: 'movies',
        tags: [],
        visibility: 'public',
      }
    )
    const unlisted = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Unlisted Related',
        category: 'gaming',
        tags: [],
        visibility: 'unlisted',
      }
    )

    await setTemplateUseCount(t, current.slug, 100)
    await setTemplateUseCount(t, relatedA.slug, 50)
    await setTemplateUseCount(t, relatedB.slug, 30)
    await setTemplateUseCount(t, otherCategory.slug, 90)
    await setTemplateUseCount(t, unlisted.slug, 80)

    const related = await t.query(
      api.marketplace.templates.queries.getRelatedTemplates,
      { slug: current.slug, limit: 2 }
    )

    expect(related.items.map((item) => item.title)).toEqual([
      'Related A',
      'Related B',
    ])
    expect(related.items.map((item) => item.slug)).not.toContain(current.slug)
  })

  it('clones a template into a new board using a user tier preset', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    const consumerId = await seedUser(t, 'Consumer', 'consumer@example.com')
    await seedSourceBoard(t, authorId)
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
    expect(board?.tiers.map((tier) => tier.name)).toEqual(['Keep', 'Skip'])
    expect(board?.items).toHaveLength(2)
    expect(board?.items.every((item) => item.tierId === null)).toBe(true)
    expect(board?.items[0]).toMatchObject({
      label: 'Image item',
      mediaContentHash: 'hash-source',
    })
    expect(board?.items[0].mediaExternalId).not.toBe('media-source')

    const templateList = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { sort: 'popular' }
    )
    expect(templateList.items[0]).toMatchObject({
      slug,
      useCount: 1,
    })

    const clonedRows = await t.run(async (ctx) =>
    {
      const storedBoard = await ctx.db
        .query('boards')
        .withIndex('byOwnerAndExternalId', (q) =>
          q.eq('ownerId', consumerId).eq('externalId', result.boardExternalId)
        )
        .unique()

      const items = storedBoard
        ? await ctx.db
            .query('boardItems')
            .withIndex('byBoardAndTier', (q) =>
              q.eq('boardId', storedBoard._id)
            )
            .collect()
        : []

      return { storedBoard, items }
    })

    expect(clonedRows.storedBoard?.sourceTemplateId).toBeTruthy()
    expect(clonedRows.items.every((item) => item.templateItemId)).toBe(true)
  })

  it('publishes template layout settings and applies them when cloned', async () =>
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

    const { slug } = await asUser(t, authorId).mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Widescreen Template',
        category: 'movies',
        tags: [],
        visibility: 'public',
      }
    )

    const detail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug }
    )
    expect(detail).toMatchObject({
      itemAspectRatio: 16 / 9,
      defaultItemImageFit: 'contain',
    })
    expect(detail?.labels).toEqual(labels)
    expect(detail?.items[0]).toMatchObject({ transform, imageFit: null })

    const result = await asUser(t, consumerId).mutation(
      api.marketplace.templates.mutations.useTemplate,
      { slug }
    )
    const board = await asUser(t, consumerId).query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: result.boardExternalId }
    )

    expect(board).toMatchObject({
      itemAspectRatio: 16 / 9,
      itemAspectRatioMode: 'manual',
      defaultItemImageFit: 'contain',
    })
    expect(board?.labels).toEqual(labels)
    expect(board?.items[0]).toMatchObject({ transform })
    expect(board?.items[0].imageFit).toBeUndefined()
  })

  it('lists in-progress template drafts and updates their progress', async () =>
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
      boardTitle: 'My Draft',
      activeItemCount: 2,
      rankedItemCount: 0,
      unrankedItemCount: 2,
      progressPercent: 0,
    })
    expect(drafts.drafts[0].template.slug).toBe(slug)

    const board = await consumer.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId }
    )
    expect(board).not.toBeNull()

    const firstTier = board!.tiers[0]
    const sortedItems = board!.items.slice().sort((a, b) => a.order - b.order)
    const [rankedItem, remainingItem] = sortedItems

    await consumer.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId,
        baseRevision: board!.revision,
        title: board!.title,
        tiers: board!.tiers.map((tier) =>
          toWireTier(
            tier,
            tier.externalId === firstTier.externalId
              ? [rankedItem.externalId]
              : []
          )
        ),
        items: [
          toWireItem(rankedItem, firstTier.externalId, 0),
          toWireItem(remainingItem, null, 1),
        ],
        deletedItemIds: [],
      }
    )

    drafts = await consumer.query(
      api.marketplace.templates.queries.getMyTemplateDrafts,
      {}
    )
    expect(drafts.drafts).toHaveLength(1)
    expect(drafts.drafts[0]).toMatchObject({
      activeItemCount: 2,
      rankedItemCount: 1,
      unrankedItemCount: 1,
      progressPercent: 50,
    })

    const updatedBoard = await consumer.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId }
    )
    expect(updatedBoard).not.toBeNull()

    const allRankedItems = updatedBoard!.items
      .slice()
      .sort((a, b) => a.order - b.order)

    await consumer.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId,
        baseRevision: updatedBoard!.revision,
        title: updatedBoard!.title,
        tiers: updatedBoard!.tiers.map((tier) =>
          toWireTier(
            tier,
            tier.externalId === firstTier.externalId
              ? allRankedItems.map((item) => item.externalId)
              : []
          )
        ),
        items: allRankedItems.map((item, order) =>
          toWireItem(item, firstTier.externalId, order)
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

  it('filters listings by tag using the normalized templateTags table', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')
    await seedSourceBoard(t, authorId)
    const caller = asUser(t, authorId)

    const tagged = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Tagged Public',
        description: 'commonsearch',
        category: 'gaming',
        tags: ['RPG', 'Strategy'],
        visibility: 'public',
      }
    )
    const otherCategory = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Tagged Other Category',
        description: 'commonsearch',
        category: 'movies',
        tags: ['rpg'],
        visibility: 'public',
      }
    )
    const noMatch = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Untagged',
        description: 'commonsearch',
        category: 'gaming',
        tags: ['party'],
        visibility: 'public',
      }
    )
    const unlistedTagged = await caller.mutation(
      api.marketplace.templates.mutations.publishFromBoard,
      {
        boardExternalId: 'board-source',
        title: 'Unlisted Tagged',
        description: 'commonsearch',
        category: 'gaming',
        tags: ['rpg'],
        visibility: 'unlisted',
      }
    )

    // tag arg matches the canonical lowercase form; uppercase publish tags
    // & repeated entries are normalized at write time
    const byTag = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    const titlesByTag = byTag.items.map((item) => item.title).sort()
    expect(titlesByTag).toEqual(['Tagged Other Category', 'Tagged Public'])
    expect(byTag.items.map((item) => item.slug)).not.toContain(noMatch.slug)
    expect(byTag.items.map((item) => item.slug)).not.toContain(
      unlistedTagged.slug
    )

    const bySearchAndTag = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { search: 'commonsearch', tag: 'rpg' }
    )
    const titlesBySearchAndTag = bySearchAndTag.items
      .map((item) => item.title)
      .sort()
    expect(titlesBySearchAndTag).toEqual([
      'Tagged Other Category',
      'Tagged Public',
    ])
    expect(bySearchAndTag.items.map((item) => item.slug)).not.toContain(
      noMatch.slug
    )

    // tag + category narrows further
    const byTagAndCategory = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg', category: 'gaming' }
    )
    expect(byTagAndCategory.items.map((item) => item.title)).toEqual([
      'Tagged Public',
    ])

    // visibility flips remove the tag row from public listings
    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: tagged.slug }
    )
    const afterUnpublish = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    expect(afterUnpublish.items.map((item) => item.title)).toEqual([
      'Tagged Other Category',
    ])

    // editing tags reflects in the next tag-filtered query
    await caller.mutation(
      api.marketplace.templates.mutations.updateMyTemplateMeta,
      { slug: otherCategory.slug, tags: ['party'] }
    )
    const afterRetag = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    expect(afterRetag.items).toEqual([])
    const newTagHits = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'party' }
    )
    expect(newTagHits.items.map((item) => item.title).sort()).toEqual([
      'Tagged Other Category',
      'Untagged',
    ])
  })
})
