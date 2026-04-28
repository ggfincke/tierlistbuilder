// tests/convex/userCascade.test.ts
// Convex account-deletion & template-cascade cleanup behavior

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import schema from '../../convex/schema'
import { modules } from './convexTestHelpers'

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
        tier: 'free',
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
    const templateId = await ctx.db.insert('templates', {
      slug: TEMPLATE_SLUG,
      authorId,
      title: 'Cascade Template',
      description: null,
      category: 'gaming',
      tags: ['cleanup', 'cascade'],
      visibility: 'public',
      coverMediaAssetId: null,
      coverItems: [],
      suggestedTiers: [{ name: 'S', colorSpec: { kind: 'palette', index: 0 } }],
      sourceBoardExternalId: null,
      itemCount,
      useCount: 0,
      viewCount: 0,
      featuredRank: null,
      creditLine: null,
      searchText: 'cascade template cleanup',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unpublishedAt: null,
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
      })
    }

    for (const tag of ['cleanup', 'cascade'])
    {
      await ctx.db.insert('templateTags', {
        templateId,
        tag,
        category: 'gaming',
        visibility: 'public',
        unpublishedAt: null,
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

describe('user cascade cleanup', () =>
{
  it('deletes the template parent before child cleanup pages finish', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const templateId = await seedTemplate(t, userId, 260)
      const listedBefore = await t.query(
        api.marketplace.templates.queries.listTemplates,
        { limit: 10 }
      )

      expect(listedBefore.items).toHaveLength(1)
      await t.mutation(
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        { templateId }
      )

      const intermediate = await t.run(async (ctx) => ({
        template: await ctx.db.get(templateId),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
        tags: await ctx.db
          .query('templateTags')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
      }))
      const listedAfterFirstPage = await t.query(
        api.marketplace.templates.queries.listTemplates,
        { limit: 10 }
      )
      const taggedAfterFirstPage = await t.query(
        api.marketplace.templates.queries.listTemplates,
        { tag: 'cleanup', limit: 10 }
      )
      const detailAfterFirstPage = await t.query(
        api.marketplace.templates.queries.getTemplateBySlug,
        { slug: TEMPLATE_SLUG }
      )
      const countAfterFirstPage = await t.query(
        api.marketplace.templates.queries.getPublicTemplateCount,
        {}
      )

      expect(intermediate.template).toBeNull()
      expect(intermediate.items).toHaveLength(4)
      expect(intermediate.tags).toHaveLength(2)
      expect(listedAfterFirstPage.items).toHaveLength(0)
      expect(taggedAfterFirstPage.items).toHaveLength(0)
      expect(detailAfterFirstPage).toBeNull()
      expect(countAfterFirstPage).toEqual({
        count: 0,
        countByCategory: {},
      })

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const remaining = await t.run(async (ctx) => ({
        template: await ctx.db.get(templateId),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
        tags: await ctx.db
          .query('templateTags')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
      }))

      expect(remaining.template).toBeNull()
      expect(remaining.items).toHaveLength(0)
      expect(remaining.tags).toHaveLength(0)
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('removes account templates before advancing the user cascade', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const templateId = await seedTemplate(t, userId, 260)

      await t.mutation(internal.users.cascadeDeleteUserData, {
        userId,
        phase: 'templates',
        cursor: null,
      })

      const intermediate = await t.run(async (ctx) => ({
        template: await ctx.db.get(templateId),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
        tags: await ctx.db
          .query('templateTags')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
      }))
      const listedAfterTemplatePhase = await t.query(
        api.marketplace.templates.queries.listTemplates,
        { limit: 10 }
      )
      const countAfterTemplatePhase = await t.query(
        api.marketplace.templates.queries.getPublicTemplateCount,
        {}
      )

      expect(intermediate.template).toBeNull()
      expect(intermediate.items).toHaveLength(260)
      expect(intermediate.tags).toHaveLength(2)
      expect(listedAfterTemplatePhase.items).toHaveLength(0)
      expect(countAfterTemplatePhase).toEqual({
        count: 0,
        countByCategory: {},
      })

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const remaining = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        template: await ctx.db.get(templateId),
        items: await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
        tags: await ctx.db
          .query('templateTags')
          .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
          .collect(),
      }))

      expect(remaining.user).toBeNull()
      expect(remaining.template).toBeNull()
      expect(remaining.items).toHaveLength(0)
      expect(remaining.tags).toHaveLength(0)
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('signOutEverywhere drains auth sessions before returning', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const sessionId = await seedAuthRows(t, userId)

    await asUser(t, userId, sessionId).mutation(api.users.signOutEverywhere, {})

    const remaining = await readAuthState(t, userId)

    expect(remaining.user).not.toBeNull()
    expect(remaining.sessions).toHaveLength(0)
    expect(remaining.accounts).toHaveLength(2)
    expect(remaining.refreshTokens).toHaveLength(0)
    expect(remaining.codes).toHaveLength(4)
  })

  it('deleteAccount drains auth rows before deleting the user', async () =>
  {
    vi.useFakeTimers()
    try
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      await asUser(t, userId, sessionId).mutation(api.users.deleteAccount, {})

      const afterMutation = await readAuthState(t, userId)

      expect(afterMutation.user).not.toBeNull()
      expect(afterMutation.sessions).toHaveLength(0)
      expect(afterMutation.accounts).toHaveLength(0)
      expect(afterMutation.refreshTokens).toHaveLength(0)
      expect(afterMutation.codes).toHaveLength(0)

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())

      const remaining = await readAuthState(t, userId)

      expect(remaining.user).toBeNull()
      expect(remaining.sessions).toHaveLength(0)
      expect(remaining.accounts).toHaveLength(0)
      expect(remaining.refreshTokens).toHaveLength(0)
      expect(remaining.codes).toHaveLength(0)
    }
    finally
    {
      vi.useRealTimers()
    }
  })
})
