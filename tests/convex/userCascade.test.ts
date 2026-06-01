// tests/convex/userCascade.test.ts
// Convex account-deletion & template-cascade cleanup paths

import { describe, expect, it } from 'vitest'
import { Scrypt } from 'lucia'
import { api, internal } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { getUploadEnvelopeHeader } from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { classifyItemCount } from '../../convex/lib/entitlements'
import { BATCH_LIMITS } from '../../convex/lib/limits'
import {
  asUser,
  buildPngHeader,
  type ConvexTestHandle,
  expectConvexCode,
  makeRateLimitedTest as makeTest,
  runScheduled,
  seedCloudBoard,
  seedPublishedRanking,
  seedPublishedTemplate,
  seedUser,
  withFakeTimers,
} from '@tests/convex/convexTestHelpers'

const TEMPLATE_SLUG = 'Cascade001'
const AVATAR_UPLOAD_TOKEN = 'a'.repeat(64)
const EXPIRED_SESSION_REGRESSION_COUNT = 55

const seedAuthRows = async (
  t: ConvexTestHandle,
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

const seedAuthSessionWithTokens = async (
  t: ConvexTestHandle,
  userId: Id<'users'>,
  tokenCount: number
): Promise<Id<'authSessions'>> =>
  await t.run(async (ctx) =>
  {
    const sessionId = await ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 60_000,
    })
    for (let i = 0; i < tokenCount; i++)
    {
      await ctx.db.insert('authRefreshTokens', {
        sessionId,
        expirationTime: Date.now() + 60_000,
      })
    }
    return sessionId
  })

const storeAvatarUpload = async (
  t: ConvexTestHandle,
  userId: Id<'users'>
): Promise<Id<'_storage'>> =>
  await t.run(
    async (ctx) =>
      await ctx.storage.store(
        new Blob(
          [
            getUploadEnvelopeHeader('media', userId, AVATAR_UPLOAD_TOKEN),
            buildPngHeader(64, 64),
          ],
          { type: 'application/octet-stream' }
        )
      )
  )

const seedPasswordAccount = async (
  t: ConvexTestHandle,
  email: string,
  password: string
): Promise<{ userId: Id<'users'>; sessionId: Id<'authSessions'> }> =>
{
  const userId = await seedUser(t, 'Password User', email)
  const secret = await new Scrypt().hash(password)
  const sessionId = await t.run(async (ctx) =>
  {
    await ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: email,
      secret,
    })
    return await ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 60_000,
    })
  })
  return { userId, sessionId }
}

const seedAuthAccountWithCodes = async (
  t: ConvexTestHandle,
  userId: Id<'users'>,
  codeCount: number
): Promise<Id<'authAccounts'>> =>
  await t.run(async (ctx) =>
  {
    const accountId = await ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: 'cascade-large@example.com',
    })
    for (let i = 0; i < codeCount; i++)
    {
      await ctx.db.insert('authVerificationCodes', {
        accountId,
        provider: 'password',
        code: `large-code-${i}`,
        expirationTime: Date.now() + 60_000,
      })
    }
    return accountId
  })

const readAuthState = async (t: ConvexTestHandle, userId: Id<'users'>) =>
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

const readBoardCascade = async (t: ConvexTestHandle, boardId: Id<'boards'>) =>
  await t.run(async (ctx) => ({
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

const readTemplateCascade = async (
  t: ConvexTestHandle,
  templateId: Id<'templates'>
) =>
  await t.run(async (ctx) => ({
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

const seedProfileShowcase = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>,
  templateId: Id<'templates'>
): Promise<Id<'profileShowcases'>> =>
  await t.run(async (ctx) =>
  {
    const now = Date.now()
    const showcaseId = await ctx.db.insert('profileShowcases', {
      ownerId,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('profileShowcaseTiers', {
      showcaseId,
      externalId: 'tier-s',
      name: 'S',
      colorSpec: { kind: 'palette', index: 0 },
      order: 0,
    })
    const boardId = await seedCloudBoard(ctx, {
      ownerId,
      externalId: 'cascade-showcase-board',
      title: 'Cascade Showcase Board',
      sourceTemplateId: templateId,
      now,
    })
    await ctx.db.insert('profileShowcaseItems', {
      showcaseId,
      tierExternalId: 'tier-s',
      boardId,
      order: 0,
    })
    return showcaseId
  })

const readProfileShowcaseCascade = async (
  t: ConvexTestHandle,
  showcaseId: Id<'profileShowcases'>
) =>
  await t.run(async (ctx) => ({
    showcase: await ctx.db.get(showcaseId),
    tiers: await ctx.db
      .query('profileShowcaseTiers')
      .withIndex('byShowcase', (q) => q.eq('showcaseId', showcaseId))
      .collect(),
    items: await ctx.db
      .query('profileShowcaseItems')
      .withIndex('byShowcase', (q) => q.eq('showcaseId', showcaseId))
      .collect(),
  }))

const seedTemplate = async (
  t: ConvexTestHandle,
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
  t: ConvexTestHandle,
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
    await withFakeTimers(async () =>
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

      const intermediate = await readBoardCascade(t, boardId)
      expect(intermediate.board).not.toBeNull()
      expect(intermediate.items).toHaveLength(4)
      expect(intermediate.tiers).toHaveLength(260)

      await runScheduled(t)

      const remaining = await readBoardCascade(t, boardId)
      expect(remaining.board).toBeNull()
      expect(remaining.items).toHaveLength(0)
      expect(remaining.tiers).toHaveLength(0)
    }))

  it('cascadeDeleteTemplate hides parent immediately & finishes children via scheduled work', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const templateId = await seedTemplate(t, userId, 260)

      await t.mutation(
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        { templateId }
      )

      const intermediate = await readTemplateCascade(t, templateId)
      expect(intermediate.template).toBeNull()
      expect(intermediate.stats).toBeNull()
      expect(intermediate.items.length).toBeGreaterThan(0)

      const listed = await t.query(
        api.marketplace.templates.queries.listTemplates,
        { limit: 10 }
      )
      expect(listed.items).toHaveLength(0)

      await runScheduled(t)

      const remaining = await readTemplateCascade(t, templateId)
      expect(remaining.items).toHaveLength(0)
      expect(remaining.stats).toBeNull()
    }))

  it('cascadeDeleteUserData removes account templates and rankings before user deletion', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const templateId = await seedTemplate(t, userId, 260)
      const rankingId = await seedRanking(t, userId, templateId, 260)
      const showcaseId = await seedProfileShowcase(t, userId, templateId)

      await t.mutation(internal.users.cascadeDeleteUserData, {
        userId,
        phase: 'templates',
        cursor: null,
      })

      await runScheduled(t)

      const templateCascade = await readTemplateCascade(t, templateId)
      const showcaseCascade = await readProfileShowcaseCascade(t, showcaseId)
      const remaining = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
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
      expect(templateCascade.template).toBeNull()
      expect(templateCascade.stats).toBeNull()
      expect(templateCascade.items).toHaveLength(0)
      expect(showcaseCascade.showcase).toBeNull()
      expect(showcaseCascade.tiers).toHaveLength(0)
      expect(showcaseCascade.items).toHaveLength(0)
      expect(remaining.rankings).toHaveLength(0)
      expect(remaining.rankingTiers).toHaveLength(0)
      expect(remaining.rankingItems).toHaveLength(0)
    }))

  it('signOutEverywhere clears sessions/refreshTokens but keeps the user & accounts', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      await asUser(t, userId, sessionId).mutation(
        api.users.signOutEverywhere,
        {}
      )
      await runScheduled(t)

      const after = await readAuthState(t, userId)
      expect(after.user).not.toBeNull()
      expect(after.sessions).toHaveLength(0)
      expect(after.accounts).toHaveLength(2)
      expect(after.refreshTokens).toHaveLength(0)
      expect(after.codes).toHaveLength(4)
    }))

  it('lists sessions and marks the current session', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      const sessions = await asUser(t, userId, sessionId).query(
        api.users.listSessions,
        {}
      )

      expect(sessions).toHaveLength(3)
      expect(sessions.filter((session) => session.isCurrent)).toHaveLength(1)
      expect(
        sessions.find((session) => session._id === sessionId)?.isCurrent
      ).toBe(true)
      expect(sessions[0]).toMatchObject({
        createdAt: expect.any(Number),
        expiresAt: expect.any(Number),
      })
    }))

  it('omits expired sessions before applying the active-session cap', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const activeSessionIds = await t.run(async (ctx) =>
      {
        const now = Date.now()
        const first = await ctx.db.insert('authSessions', {
          userId,
          expirationTime: now + 60_000,
        })
        const second = await ctx.db.insert('authSessions', {
          userId,
          expirationTime: now + 60_000,
        })

        for (let i = 0; i < EXPIRED_SESSION_REGRESSION_COUNT; i++)
        {
          await ctx.db.insert('authSessions', {
            userId,
            expirationTime: now - 60_000,
          })
        }
        return [first, second]
      })

      const sessions = await asUser(t, userId, activeSessionIds[0]).query(
        api.users.listSessions,
        {}
      )

      expect(sessions).toHaveLength(activeSessionIds.length)
      expect(sessions.map((session) => session._id).sort()).toEqual(
        [...activeSessionIds].sort()
      )
      expect(sessions.every((session) => session.expiresAt > Date.now())).toBe(
        true
      )
      expect(
        sessions.find((session) => session._id === activeSessionIds[0])
          ?.isCurrent
      ).toBe(true)
    }))

  it('revokes one session without clearing sibling sessions', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)
      const otherSessionId = await seedAuthSessionWithTokens(t, userId, 2)

      const result = await asUser(t, userId, sessionId).mutation(
        api.users.revokeSession,
        { sessionId: otherSessionId }
      )
      await runScheduled(t)

      const after = await readAuthState(t, userId)
      expect(result).toEqual({ revokedCurrent: false })
      expect(after.sessions.map((session) => session._id)).not.toContain(
        otherSessionId
      )
      expect(after.sessions.map((session) => session._id)).toContain(sessionId)
      expect(
        after.refreshTokens.some((token) => token.sessionId === otherSessionId)
      ).toBe(false)
    }))

  it('reports when revoking the current session', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      const result = await asUser(t, userId, sessionId).mutation(
        api.users.revokeSession,
        { sessionId }
      )
      await runScheduled(t)

      const after = await readAuthState(t, userId)
      expect(result).toEqual({ revokedCurrent: true })
      expect(after.sessions.map((session) => session._id)).not.toContain(
        sessionId
      )
    }))

  it('rejects avatar uploads with a mismatched envelope token', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const storageId = await storeAvatarUpload(t, userId)

      await expectConvexCode(
        asUser(t, userId).action(api.users.setAvatar, {
          storageId,
          uploadToken: 'b'.repeat(64),
        }),
        CONVEX_ERROR_CODES.forbidden
      )
    }))

  it('changes password, verifies the credential & force-signs-out siblings', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const { userId, sessionId } = await seedPasswordAccount(
        t,
        'password-change@example.com',
        'old-password'
      )
      const otherSessionId = await seedAuthSessionWithTokens(
        t,
        userId,
        BATCH_LIMITS.cascadeDelete + 1
      )
      const caller = asUser(t, userId, sessionId)

      await expectConvexCode(
        caller.action(api.users.changePassword, {
          currentPassword: 'wrong-password',
          newPassword: 'new-password',
        }),
        CONVEX_ERROR_CODES.invalidInput
      )

      // a failed verification must not revoke any session
      const afterFailure = await readAuthState(t, userId)
      expect(
        afterFailure.sessions.map((session) => session._id).sort()
      ).toEqual([sessionId, otherSessionId].sort())

      await caller.action(api.users.changePassword, {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      })
      await runScheduled(t)

      const after = await readAuthState(t, userId)
      expect(after.sessions.map((session) => session._id)).toEqual([sessionId])
      expect(
        after.refreshTokens.some((token) => token.sessionId === otherSessionId)
      ).toBe(false)

      await expectConvexCode(
        caller.action(api.users.changePassword, {
          currentPassword: 'old-password',
          newPassword: 'next-password',
        }),
        CONVEX_ERROR_CODES.invalidInput
      )

      await caller.action(api.users.changePassword, {
        currentPassword: 'new-password',
        newPassword: 'next-password',
      })
    }))

  it('cleanupAuthSessions keeps the parent session until refresh-token pages finish', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthSessionWithTokens(
        t,
        userId,
        BATCH_LIMITS.cascadeDelete + 1
      )

      await t.mutation(internal.users.cleanupAuthSessions, {
        userId,
        mode: 'signOutOnly',
        cursor: null,
        targetSessionId: sessionId,
        tokenCursor: null,
      })

      const intermediate = await t.run(async (ctx) => ({
        session: await ctx.db.get(sessionId),
        tokens: await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', sessionId))
          .collect(),
      }))
      expect(intermediate.session).not.toBeNull()
      expect(intermediate.tokens).toHaveLength(1)

      await runScheduled(t)

      const remaining = await t.run(async (ctx) => ({
        session: await ctx.db.get(sessionId),
        tokens: await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', sessionId))
          .collect(),
      }))
      expect(remaining.session).toBeNull()
      expect(remaining.tokens).toHaveLength(0)
    }))

  it('cascadeDeleteUserData keeps the parent account until code pages finish', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const accountId = await seedAuthAccountWithCodes(
        t,
        userId,
        BATCH_LIMITS.cascadeDelete + 1
      )

      await t.mutation(internal.users.cascadeDeleteUserData, {
        userId,
        phase: 'authAccounts',
        cursor: null,
        targetAccountId: accountId,
        codeCursor: null,
      })

      const intermediate = await t.run(async (ctx) => ({
        account: await ctx.db.get(accountId),
        codes: await ctx.db
          .query('authVerificationCodes')
          .withIndex('accountId', (q) => q.eq('accountId', accountId))
          .collect(),
      }))
      expect(intermediate.account).not.toBeNull()
      expect(intermediate.codes).toHaveLength(1)

      await runScheduled(t)

      const remaining = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        account: await ctx.db.get(accountId),
        codes: await ctx.db
          .query('authVerificationCodes')
          .withIndex('accountId', (q) => q.eq('accountId', accountId))
          .collect(),
      }))
      expect(remaining.user).toBeNull()
      expect(remaining.account).toBeNull()
      expect(remaining.codes).toHaveLength(0)
    }))

  it('deleteAccount cascades user + accounts + codes after scheduled cleanup', async () =>
    await withFakeTimers(async () =>
    {
      const t = makeTest()
      const userId = await seedUser(t)
      const sessionId = await seedAuthRows(t, userId)

      await asUser(t, userId, sessionId).mutation(api.users.deleteAccount, {})
      await runScheduled(t)

      const after = await readAuthState(t, userId)
      expect(after.user).toBeNull()
      expect(after.sessions).toHaveLength(0)
      expect(after.accounts).toHaveLength(0)
      expect(after.refreshTokens).toHaveLength(0)
      expect(after.codes).toHaveLength(0)
    }))
})
