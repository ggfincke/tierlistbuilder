// tests/convex/seedRuns.test.ts
// Convex seed-run precheck API authorization & state resolution

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import schema from '../../convex/schema'
import { modules, seedPublishedTemplate } from './convexTestHelpers'

const SEED_SECRET = 'test-seed-secret'
const DATASET = 'marketplace-core'
const RELEASE = '2026-05-templates-v1'
const AUTHOR_EMAIL = 'seed@example.com'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
{
  const t = convexTest({ schema, modules, transactionLimits: true })
  rateLimiter.register(t)
  return t
}

const originalEnv = {
  enabled: process.env.CONVEX_SEED_ENABLED,
  secret: process.env.CONVEX_SEED_SECRET,
}

const restoreEnv = (): void =>
{
  if (originalEnv.enabled === undefined) delete process.env.CONVEX_SEED_ENABLED
  else process.env.CONVEX_SEED_ENABLED = originalEnv.enabled

  if (originalEnv.secret === undefined) delete process.env.CONVEX_SEED_SECRET
  else process.env.CONVEX_SEED_SECRET = originalEnv.secret
}

const enableSeedApi = (): void =>
{
  process.env.CONVEX_SEED_ENABLED = 'true'
  process.env.CONVEX_SEED_SECRET = SEED_SECRET
}

const criteria: MarketplaceTemplateCriterion[] = [
  {
    externalId: 'competitive',
    name: 'Competitive',
    shortName: 'Comp',
    prompt: 'Rank by viability.',
    axisTop: 'Strongest',
    axisBottom: 'Weakest',
    order: 0,
    isPrimary: true,
    status: 'active',
  },
]

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  email: string
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name: email,
        displayName: email,
        email,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plan: 'free',
      })
  )

const seedTemplateWithItem = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  authorId: Id<'users'>,
  externalId: string,
  itemExternalIds: readonly string[]
): Promise<Id<'templates'>> =>
  await t.run(async (ctx) =>
  {
    const templateId = await seedPublishedTemplate(ctx, {
      authorId,
      slug: externalId.replace(':', '-'),
      title: externalId,
      itemCount: itemExternalIds.length,
      sizeClass: 'standard',
      criteria,
    })
    await ctx.db.patch(templateId, {
      seedDatasetKey: DATASET,
      seedExternalId: externalId,
      seedReleaseId: '2026-04-old-release',
      seedReleaseStatus: 'active',
      itemAspectRatio: 1,
    })
    await Promise.all(
      itemExternalIds.map((itemExternalId, index) =>
        ctx.db.insert('templateItems', {
          templateId,
          externalId: itemExternalId,
          label: itemExternalId,
          backgroundColor: null,
          altText: itemExternalId,
          mediaAssetId: null,
          order: index,
          aspectRatio: 1,
          imageFit: null,
          transform: null,
        })
      )
    )
    return templateId
  })

const seedMediaVariant = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  ownerId: Id<'users'>,
  contentHash: string
): Promise<Doc<'mediaVariants'>> =>
  await t.run(async (ctx) =>
  {
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    )
    const mediaAssetId = await ctx.db.insert('mediaAssets', {
      ownerId,
      externalId: `media-${contentHash}`,
      dedupeHash: `tile:${contentHash}`,
      tileVariant: {
        storageId,
        width: 32,
        height: 32,
        byteSize: 3,
        mimeType: 'image/png',
        contentHash,
      },
      createdAt: Date.now(),
    })
    const variantId = await ctx.db.insert('mediaVariants', {
      mediaAssetId,
      kind: 'tile',
      storageId,
      width: 32,
      height: 32,
      byteSize: 3,
      mimeType: 'image/png',
      contentHash,
      createdAt: Date.now(),
    })
    const variant = await ctx.db.get(variantId)
    if (!variant) throw new Error('media variant missing')
    return variant
  })

describe('seed run precheck API', () =>
{
  beforeEach(() =>
  {
    delete process.env.CONVEX_SEED_ENABLED
    delete process.env.CONVEX_SEED_SECRET
  })
  afterEach(restoreEnv)

  it('gates beginSeedRun and makes run registration idempotent', async () =>
  {
    const t = makeTest()
    await expect(
      t.mutation(api.marketplace.seedRuns.beginSeedRun, {
        seedSecret: SEED_SECRET,
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-1',
        templateCount: 2,
        itemCount: 5,
        imageVariantCount: 10,
      })
    ).rejects.toThrow(/seeding is disabled/)

    enableSeedApi()
    const first = await t.mutation(api.marketplace.seedRuns.beginSeedRun, {
      seedSecret: SEED_SECRET,
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-1',
      templateCount: 2,
      itemCount: 5,
      imageVariantCount: 10,
    })
    const second = await t.mutation(api.marketplace.seedRuns.beginSeedRun, {
      seedSecret: SEED_SECRET,
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-1',
      templateCount: 99,
      itemCount: 99,
      imageVariantCount: 99,
    })

    expect(first.run.status).toBe('building')
    expect(second.run).toEqual(first.run)
  })

  it('resolves active release, external IDs, criteria, and absent rows', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    await seedTemplateWithItem(t, authorId, 'gaming:ssbu-fighters', [
      'mario',
      'absent-item',
    ])
    await seedTemplateWithItem(t, authorId, 'gaming:old-template', ['old'])
    await t.run(
      async (ctx) =>
        await ctx.db.insert('seedRuns', {
          runId: 'active-run',
          datasetKey: DATASET,
          releaseId: '2026-04-old-release',
          status: 'active',
          startedAt: 10,
          finishedAt: 11,
          startedBy: 'test',
          templateCount: 2,
          itemCount: 3,
          imageVariantCount: 6,
          uploadedBytes: 0,
          error: null,
        })
    )

    enableSeedApi()
    const state = await t.query(api.marketplace.seedRuns.resolveSeedState, {
      seedSecret: SEED_SECRET,
      datasetKey: DATASET,
      releaseId: RELEASE,
      authorEmail: AUTHOR_EMAIL,
      templateExternalIds: ['gaming:ssbu-fighters'],
      itemExternalIds: [
        { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'mario' },
      ],
      criterionExternalIds: [
        {
          templateExternalId: 'gaming:ssbu-fighters',
          criterionExternalId: 'competitive',
        },
      ],
      variantHashes: [],
    })

    expect(state.activeReleaseId).toBe('2026-04-old-release')
    expect(state.templates).toMatchObject([
      { externalId: 'gaming:ssbu-fighters', releaseId: '2026-04-old-release' },
    ])
    expect(state.items).toMatchObject([{ itemExternalId: 'mario', order: 0 }])
    expect(state.criteria).toMatchObject([
      { criterionExternalId: 'competitive', name: 'Competitive' },
    ])
    expect(state.absentFromManifest).toEqual(
      expect.arrayContaining([
        {
          templateExternalId: 'gaming:ssbu-fighters',
          itemExternalId: 'absent-item',
          action: 'absentFromRelease',
        },
        {
          templateExternalId: 'gaming:old-template',
          action: 'absentFromRelease',
        },
      ])
    )
  })

  it('resolves media hashes only for the seed author', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    const otherId = await seedUser(t, 'other@example.com')
    const authorVariant = await seedMediaVariant(t, authorId, 'hash-present')
    await seedMediaVariant(t, otherId, 'hash-present')

    enableSeedApi()
    const result = await t.query(
      api.marketplace.seedRuns.resolveSeedMediaByHashes,
      {
        seedSecret: SEED_SECRET,
        datasetKey: DATASET,
        releaseId: RELEASE,
        authorEmail: AUTHOR_EMAIL,
        variantHashes: ['hash-present', 'hash-missing'],
      }
    )

    expect(result.media).toEqual([
      {
        contentHash: 'hash-present',
        mediaAssetId: authorVariant.mediaAssetId,
        variantKind: 'tile',
        byteSize: 3,
      },
    ])
  })
})
