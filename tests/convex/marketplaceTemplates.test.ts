// tests/convex/marketplaceTemplates.test.ts
// Convex marketplace template publish, listing, clone, & draft progress

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

    const unlistedDetail = await t.query(
      api.marketplace.templates.queries.getTemplateBySlug,
      { slug: unlistedTemplate.slug }
    )
    expect(unlistedDetail).toMatchObject({
      title: 'Unlisted Template',
      visibility: 'unlisted',
      itemCount: 2,
    })

    expect(
      await t.query(
        api.marketplace.templates.queries.getPublicTemplateCount,
        {}
      )
    ).toEqual({ count: 1, countByCategory: { gaming: 1 } })

    await caller.mutation(
      api.marketplace.templates.mutations.updateMyTemplateMeta,
      { slug: unlistedTemplate.slug, visibility: 'public' }
    )
    expect(
      await t.query(
        api.marketplace.templates.queries.getPublicTemplateCount,
        {}
      )
    ).toEqual({ count: 2, countByCategory: { gaming: 1, movies: 1 } })

    await caller.mutation(
      api.marketplace.templates.mutations.unpublishMyTemplate,
      { slug: publicTemplate.slug }
    )
    expect(
      await t.query(
        api.marketplace.templates.queries.getPublicTemplateCount,
        {}
      )
    ).toEqual({ count: 1, countByCategory: { movies: 1 } })
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

    const byTag = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { tag: 'rpg' }
    )
    expect(byTag.items.map((i) => i.title)).toEqual(['Tagged Public'])

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

    const popular = await t.query(
      api.marketplace.templates.queries.listTemplates,
      { sort: 'popular' }
    )
    expect(popular.items[0]).toMatchObject({ slug, useCount: 1 })
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
})
