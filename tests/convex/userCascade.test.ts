// tests/convex/userCascade.test.ts
// Convex account-deletion & template-cascade cleanup paths

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { classifyItemCount } from '../../convex/lib/entitlements'
import schema from '../../convex/schema'
import {
  modules,
  seedCloudBoard,
  seedPublishedRanking,
  seedPublishedTemplate,
} from './convexTestHelpers'

const TEMPLATE_SLUG = 'Cascade001'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
{
  const t = convexTest({ schema, modules, transactionLimits: true })
  rateLimiter.register(t)
  return t
}

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name: 'Cascade User',
        displayName: 'Cascade User',
        email: 'cascade@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plan: 'free',
      })
  )

const asUser = (
  t: ReturnType<typeof convexTest<typeof schema>>,
  userId: Id<'users'>,
  sessionId: Id<'authSessions'>
) =>
  t.withIdentity({
    subject: `${userId}|${sessionId}`,
    issuer: 'https://convex.test',
  })

const seedAuthRows = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  userId: Id<'users'>
): Promise<Id<'authSessions'>> =>
  await t.run(async (ctx) =>
  {
    const sessionIds: Id<'authSessions'>[] = []
    for (let i = 0; i < 3; i++)
    {
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 60_000,
      })
      sessionIds.push(sessionId)
      for (let j = 0; j < 3; j++)
      {
        await ctx.db.insert('authRefreshTokens', {
          sessionId,
          expirationTime: Date.now() + 60_000,
        })
      }
    }
    for (let i = 0; i < 2; i++)
    {
      const accountId = await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: `cascade-${i}@example.com`,
      })
      for (let j = 0; j < 2; j++)
      {
        await ctx.db.insert('authVerificationCodes', {
          accountId,
          provider: 'password',
          code: `code-${i}-${j}`,
          expirationTime: Date.now() + 60_000,
        })
      }
    }
    return sessionIds[0]
  })

const readAuthState = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  userId: Id<'users'>
) =>
  await t.run(async (ctx) => ({
    user: await ctx.db.get(userId),
    sessions: await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect(),
    accounts: await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect(),
    refreshTokens: await ctx.db.query('authRefreshTokens').collect(),
    codes: await ctx.db.query('authVerificationCodes').collect(),
  }))

const seedTemplate = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  authorId: Id<'users'>,
  itemCount: number
): Promise<Id<'templates'>> =>
  await t.run(async (ctx) =>
  {
    const templateId = await seedPublishedTemplate(ctx, {
      slug: TEMPLATE_SLUG,
      authorId,
      title: 'Cascade Template',
      category: 'gaming',
      tags: ['cleanup', 'cascade'],
      sizeClass: classifyItemCount(itemCount),
      itemCount,
    })
    for (let i = 0; i < itemCount; i++)
    {
      await ctx.db.insert('templateItems', {
        templateId,
        externalId: `item-${i}`,
        label: `Item ${i}`,
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
    for (const tag of ['cleanup', 'cascade'])
    {
      await ctx.db.insert('templateTags', {
        templateId,
        tag,
        category: 'gaming',
        isPubliclyListable: true,
        updatedAt: Date.now(),
      })
    }
    await ctx.db.insert('marketplaceStats', {
      key: 'templates',
      publicTemplateCount: 1,
      publicTemplateCountByCategory: { gaming: 1 },
      updatedAt: Date.now(),
    })
    return templateId
  })

const seedRanking = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>,
  templateId: Id<'templates'>,
  itemCount: number
): Promise<Id<'publishedRankings'>> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const boardId = await seedCloudBoard(ctx, {
      externalId: 'ranking-source-board',
      ownerId,
      title: 'Ranking Source',
      sourceTemplateId: templateId,
      sourceTemplateCategory: 'gaming',
      sourceTemplateSizeClass: classifyItemCount(itemCount),
      now,
      activeItemCount: itemCount,
      unrankedItemCount: 0,
      templateProgressState: 'complete',
    })
    const rankingId = await seedPublishedRanking(ctx, {
      slug: 'CascadeR1',
      ownerId,
      sourceTemplateId: templateId,
      sourceBoardId: boardId,
      sourceTemplateSlug: TEMPLATE_SLUG,
      sourceTemplateTitle: 'Cascade Template',
      title: 'Cascade Ranking',
      itemCount,
      now,
    })
    await ctx.db.insert('publishedRankingTiers', {
      rankingId,
      externalId: 'ranking-tier-1',
      name: 'Great',
      description: null,
      colorSpec: { kind: 'palette', index: 0 },
      rowColorSpec: null,
      order: 0,
    })
    const templateItems = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
      .take(itemCount)
    for (let i = 0; i < itemCount; i++)
    {
      await ctx.db.insert('publishedRankingItems', {
        rankingId,
        templateItemId: templateItems[i]._id,
        templateItemExternalId: templateItems[i].externalId,
        externalId: `ranking-item-${i}`,
        tierExternalId: 'ranking-tier-1',
        label: `Ranking Item ${i}`,
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
    return rankingId
  })

describe('user cascade cleanup', () =>
{
  it('cascadeDeleteBoard drains item and tier pages before deleting board', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const boardId = await t.run(async (ctx) =>
      {
        const now = Date.now()
        const boardId = await seedCloudBoard(ctx, {
          externalId: 'board-cascade-large',
          ownerId: userId,
          title: 'Large Cascade Board',
          now,
          activeItemCount: 260,
          unrankedItemCount: 0,
        })
        const tierIds = await Promise.all(
          Array.from(
            { length: 260 },
            async (_, index) =>
              await ctx.db.insert('boardTiers', {
                boardId,
                externalId: `tier-${index}`,
                name: `Tier ${index}`,
                colorSpec: { kind: 'palette', index: index % 6 },
                order: index,
              })
          )
        )
        await Promise.all(
          Array.from(
            { length: 260 },
            async (_, index) =>
              await ctx.db.insert('boardItems', {
                boardId,
                tierId: tierIds[0],
                externalId: `item-${index}`,
                label: `Item ${index}`,
                mediaAssetId: null,
                order: index,
                deletedAt: null,
              })
          )
        )
        return boardId
      })

      await t.mutation(internal.workspace.boards.internal.cascadeDeleteBoard, {
        boardId,
      })

      const intermediate = await t.run(async (ctx) => ({
        board: await ctx.db.get(boardId),
        items: await ctx.db
          .query('boardItems')
          .withIndex('byBoardAndTier', (q) => q.eq('boardId', boardId))
          .collect(),
        tiers: await ctx.db
          .query('boardTiers')
          .withIndex('byBoard', (q) => q.eq('boardId', boardId))
          .collect(),
      }))
      expect(intermediate.board).not.toBeNull()
      expect(intermediate.items).toHaveLength(4)
      expect(intermediate.tiers).toHaveLength(260)

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const remaining = await t.run(async (ctx) => ({
        board: await ctx.db.get(boardId),
        items: await ctx.db
          .query('boardItems')
          .withIndex('byBoardAndTier', (q) => q.eq('boardId', boardId))
          .collect(),
        tiers: await ctx.db
          .query('boardTiers')
          .withIndex('byBoard', (q) => q.eq('boardId', boardId))
          .collect(),
      }))
      expect(remaining.board).toBeNull()
      expect(remaining.items).toHaveLength(0)
      expect(remaining.tiers).toHaveLength(0)
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('cascadeDeleteTemplate hides parent immediately & finishes children via scheduled work', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const templateId = await seedTemplate(t, userId, 260)

      await t.mutation(
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        { templateId }
      )

      const intermediate = await t.run(async (ctx) => ({
        template: await ctx.db.get(templateId),
        stats: await ctx.db
          .query('templateStats')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .unique(),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
      }))
      expect(intermediate.template).toBeNull()
      expect(intermediate.stats).toBeNull()
      expect(intermediate.items.length).toBeGreaterThan(0)

      const listed = await t.query(
        api.marketplace.templates.queries.listTemplates,
        { limit: 10 }
      )
      expect(listed.items).toHaveLength(0)

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const remaining = await t.run(async (ctx) => ({
        template: await ctx.db.get(templateId),
        stats: await ctx.db
          .query('templateStats')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .unique(),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
      }))
      expect(remaining.items).toHaveLength(0)
      expect(remaining.stats).toBeNull()
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('cascadeDeleteUserData removes account templates and rankings before user deletion', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const templateId = await seedTemplate(t, userId, 260)
      const rankingId = await seedRanking(t, userId, templateId, 260)

      await t.mutation(internal.users.cascadeDeleteUserData, {
        userId,
        phase: 'templates',
        cursor: null,
      })

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const remaining = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        template: await ctx.db.get(templateId),
        stats: await ctx.db
          .query('templateStats')
          .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
          .unique(),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
        rankings: await ctx.db
          .query('publishedRankings')
          .withIndex('byOwnerUpdatedAt', (q) => q.eq('ownerId', userId))
          .collect(),
        rankingTiers: await ctx.db
          .query('publishedRankingTiers')
          .withIndex('byRanking', (q) => q.eq('rankingId', rankingId))
          .collect(),
        rankingItems: await ctx.db
          .query('publishedRankingItems')
          .withIndex('byRanking', (q) => q.eq('rankingId', rankingId))
          .collect(),
      }))
      expect(remaining.user).toBeNull()
      expect(remaining.template).toBeNull()
      expect(remaining.stats).toBeNull()
      expect(remaining.items).toHaveLength(0)
      expect(remaining.rankings).toHaveLength(0)
      expect(remaining.rankingTiers).toHaveLength(0)
      expect(remaining.rankingItems).toHaveLength(0)
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('signOutEverywhere clears sessions/refreshTokens but keeps the user & accounts', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      await asUser(t, userId, sessionId).mutation(
        api.users.signOutEverywhere,
        {}
      )
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const after = await readAuthState(t, userId)
      expect(after.user).not.toBeNull()
      expect(after.sessions).toHaveLength(0)
      expect(after.accounts).toHaveLength(2)
      expect(after.refreshTokens).toHaveLength(0)
      expect(after.codes).toHaveLength(4)
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('deleteAccount cascades user + accounts + codes after scheduled cleanup', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      await asUser(t, userId, sessionId).mutation(api.users.deleteAccount, {})
      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const after = await readAuthState(t, userId)
      expect(after.user).toBeNull()
      expect(after.sessions).toHaveLength(0)
      expect(after.accounts).toHaveLength(0)
      expect(after.refreshTokens).toHaveLength(0)
      expect(after.codes).toHaveLength(0)
    }
    finally
    {
      vi.useRealTimers()
    }
  })
})
