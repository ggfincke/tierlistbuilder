// tests/convex/featuredTrioSeedRoute.test.ts
// featured-trio seed HTTP route authorization & promotion behavior

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  captureSeedEnv,
  type ConvexTestHandle,
  enableSeedApi,
  makeRateLimitedTest as makeTest,
  restoreSeedEnv,
  seedPublishedTemplate,
  seedUser,
} from '@tests/convex/convexTestHelpers'

const SEED_SECRET = 'test-seed-secret'
const DATASET = 'marketplace-core'
const RELEASE = '2026-05-templates-v2'
const FEATURED_TRIO_ROUTE = '/api/seed/featured-trio'
const TRIO_EXTERNAL_IDS = [
  'gaming:ssbu-fighters',
  'gaming:zelda-games',
  'movies:entire-mcu',
] as const

const originalEnv = captureSeedEnv()

const restoreEnv = (): void =>
{
  restoreSeedEnv(originalEnv)
}

const seedHttpPost = async (
  t: ConvexTestHandle,
  body: Record<string, unknown>,
  secret: string | null = SEED_SECRET
): Promise<Response> =>
{
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (secret !== null)
  {
    headers.Authorization = `Bearer ${secret}`
  }
  return await t.fetch(FEATURED_TRIO_ROUTE, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const featuredTrioBody = (
  externalIds: readonly string[] = TRIO_EXTERNAL_IDS
) => ({
  datasetKey: DATASET,
  releaseId: RELEASE,
  externalIds,
})

const seedSeededTemplate = async (
  t: ConvexTestHandle,
  authorId: Id<'users'>,
  externalId: string,
  featuredRank: number | null = null
): Promise<Id<'templates'>> =>
  await t.run(async (ctx) =>
  {
    const templateId = await seedPublishedTemplate(ctx, {
      authorId,
      slug: externalId.replace(':', '-'),
      title: externalId,
      itemCount: 1,
      sizeClass: 'standard',
    })
    await ctx.db.patch(templateId, {
      seedDatasetKey: DATASET,
      seedReleaseId: RELEASE,
      seedExternalId: externalId,
      seedReleaseStatus: 'active',
      featuredRank,
    })
    const card = await ctx.db
      .query('templateCards')
      .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
      .unique()
    if (!card) throw new Error('seeded template card missing')
    await ctx.db.patch(card._id, { featuredRank })
    return templateId
  })

const featuredRanksByExternalId = async (
  t: ConvexTestHandle,
  externalIds: readonly string[]
): Promise<Record<string, { template: number | null; card: number | null }>> =>
  await t.run(async (ctx) =>
  {
    const ranks: Record<
      string,
      { template: number | null; card: number | null }
    > = {}
    for (const externalId of externalIds)
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', externalId)
        )
        .unique()
      if (!template) throw new Error(`seeded template missing: ${externalId}`)
      const card = await ctx.db
        .query('templateCards')
        .withIndex('byTemplateId', (q) => q.eq('templateId', template._id))
        .unique()
      if (!card) throw new Error(`seeded template card missing: ${externalId}`)
      ranks[externalId] = {
        template: template.featuredRank,
        card: card.featuredRank,
      }
    }
    return ranks
  })

describe('featured trio seed HTTP route', () =>
{
  beforeEach(() =>
  {
    delete process.env.CONVEX_SEED_ENABLED
    delete process.env.CONVEX_SEED_SECRET
  })
  afterEach(restoreEnv)

  it('requires the seed bearer token', async () =>
  {
    const t = makeTest()
    const body = featuredTrioBody()

    const disabled = await seedHttpPost(t, body, null)
    expect(disabled.status).toBe(403)
    await expect(disabled.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is disabled'),
    })

    enableSeedApi(SEED_SECRET)
    const missing = await seedHttpPost(t, body, null)
    expect(missing.status).toBe(403)
    await expect(missing.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is locked'),
    })

    const wrong = await seedHttpPost(t, body, 'wrong-secret')
    expect(wrong.status).toBe(403)
    await expect(wrong.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is locked'),
    })
  })

  it('promotes the requested external IDs and clears stale featured ranks', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'seed@example.com')
    await Promise.all(
      [...TRIO_EXTERNAL_IDS, 'gaming:stale-featured'].map(
        async (externalId, index) =>
          await seedSeededTemplate(
            t,
            authorId,
            externalId,
            externalId === 'gaming:stale-featured' ? index : null
          )
      )
    )
    enableSeedApi(SEED_SECRET)

    const response = await seedHttpPost(t, featuredTrioBody())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'success',
      value: {
        cleared: 1,
        promoted: [
          {
            externalId: 'gaming:ssbu-fighters',
            slug: 'gaming-ssbu-fighters',
            featuredRank: 0,
          },
          {
            externalId: 'gaming:zelda-games',
            slug: 'gaming-zelda-games',
            featuredRank: 1,
          },
          {
            externalId: 'movies:entire-mcu',
            slug: 'movies-entire-mcu',
            featuredRank: 2,
          },
        ],
      },
    })

    await expect(
      featuredRanksByExternalId(t, [
        ...TRIO_EXTERNAL_IDS,
        'gaming:stale-featured',
      ])
    ).resolves.toEqual({
      'gaming:ssbu-fighters': { template: 0, card: 0 },
      'gaming:zelda-games': { template: 1, card: 1 },
      'movies:entire-mcu': { template: 2, card: 2 },
      'gaming:stale-featured': { template: null, card: null },
    })
  })
})
