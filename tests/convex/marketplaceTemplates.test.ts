// tests/convex/marketplaceTemplates.test.ts
// Convex marketplace template publish, listing, & clone behavior

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
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

const seedSourceBoard = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>
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
      imageFit: 'cover',
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
})
