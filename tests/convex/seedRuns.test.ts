// tests/convex/seedRuns.test.ts
// Convex seed-run precheck API authorization & state resolution

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { internal } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import schema from '../../convex/schema'
import { sha256Hex } from '../../convex/lib/sha256'
import {
  buildPngHeader,
  captureSeedEnv,
  modules,
  restoreSeedEnv,
  seedPublishedTemplate,
  seedUser,
} from './convexTestHelpers'

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

const originalEnv = captureSeedEnv()

const restoreEnv = (): void =>
{
  restoreSeedEnv(originalEnv)
}

const enableSeedApi = (): void =>
{
  process.env.CONVEX_SEED_ENABLED = 'true'
  process.env.CONVEX_SEED_SECRET = SEED_SECRET
}

const seedHttpPost = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  path: string,
  body: Record<string, unknown>,
  secret = SEED_SECRET
): Promise<Response> =>
  await t.fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  })

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

const seedTemplateWithItem = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  authorId: Id<'users'>,
  externalId: string,
  itemExternalIds: readonly string[],
  releaseId = '2026-04-old-release'
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
      seedReleaseId: releaseId,
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

const seedRunRow = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  releaseId: string,
  status: Doc<'seedRuns'>['status'],
  runId = `${releaseId}-run`
): Promise<Id<'seedRuns'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('seedRuns', {
        runId,
        datasetKey: DATASET,
        releaseId,
        status,
        finishedAt: status === 'building' ? null : 11,
        startedBy: 'test',
        templateCount: 1,
        itemCount: 2,
        imageVariantCount: 4,
        error: null,
      })
  )

const storeImageBytes = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  bytes: Uint8Array
): Promise<Id<'_storage'>> =>
  await t.run(
    async (ctx) =>
      await ctx.storage.store(new Blob([bytes], { type: 'image/png' }))
  )

const expectStorageMissing = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  storageId: Id<'_storage'>
): Promise<void> =>
{
  const row = await t.run(async (ctx) => await ctx.db.system.get(storageId))
  expect(row).toBeNull()
}

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
    const runArgs = {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-1',
      templateCount: 2,
      itemCount: 5,
      imageVariantCount: 10,
    }
    const disabled = await seedHttpPost(t, '/api/seed/begin', runArgs)
    await expect(disabled.json()).resolves.toMatchObject({
      status: 'error',
      errorMessage: expect.stringContaining('seeding is disabled'),
    })

    enableSeedApi()
    const wrongSecret = await seedHttpPost(
      t,
      '/api/seed/begin',
      runArgs,
      'wrong-secret'
    )
    await expect(wrongSecret.json()).resolves.toMatchObject({
      status: 'error',
      errorMessage: expect.stringContaining('seeding is locked'),
    })

    await expect(
      t.mutation(internal.marketplace.seedRuns.beginSeedRun, {
        ...runArgs,
        runId: 'bad-run',
        templateCount: -1,
      })
    ).rejects.toThrow(/templateCount must be a nonnegative integer/)

    const firstResponse = await seedHttpPost(t, '/api/seed/begin', runArgs)
    const secondResponse = await seedHttpPost(t, '/api/seed/begin', {
      ...runArgs,
      templateCount: 99,
      itemCount: 99,
      imageVariantCount: 99,
    })
    const first = await firstResponse.json()
    const second = await secondResponse.json()

    expect(first.value.run.status).toBe('building')
    expect(second.value.run).toEqual(first.value.run)
  })

  it('resolves active release, external IDs, criteria, and absent rows', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    await seedTemplateWithItem(
      t,
      authorId,
      'gaming:ssbu-fighters',
      ['mario', 'absent-item'],
      RELEASE
    )
    await seedTemplateWithItem(
      t,
      authorId,
      'gaming:old-template',
      ['old'],
      RELEASE
    )
    await seedRunRow(t, '2026-04-old-release', 'active', 'active-run')

    enableSeedApi()
    const state = await t.query(
      internal.marketplace.seedRuns.resolveSeedState,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        authorEmail: AUTHOR_EMAIL,
        templateExternalIds: ['gaming:ssbu-fighters'],
        itemExternalIds: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'mario',
          },
        ],
        criterionExternalIds: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            criterionExternalId: 'competitive',
          },
        ],
        variantHashes: [],
      }
    )

    expect(state.activeReleaseId).toBe('2026-04-old-release')
    expect(state.templates).toMatchObject([
      { externalId: 'gaming:ssbu-fighters', releaseId: RELEASE },
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

    const result = await t.query(
      internal.marketplace.seedRuns.resolveSeedMediaByHashes,
      {
        authorEmail: AUTHOR_EMAIL,
        variantHashes: ['hash-present', 'hash-present', 'hash-missing'],
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

  it('generates upload URLs and validates batch bounds', async () =>
  {
    const t = makeTest()
    await expect(
      t.mutation(internal.marketplace.seedRuns.generateSeedUploadUrls, {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-uploads',
        variants: [],
      })
    ).rejects.toThrow(/variants must include 1..128 entries/)

    const result = await t.mutation(
      internal.marketplace.seedRuns.generateSeedUploadUrls,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-uploads',
        variants: [
          {
            contentHash: 'hash-a',
            kind: 'tile',
            mimeType: 'image/png',
            byteSize: 24,
          },
        ],
      }
    )
    expect(result.urls).toHaveLength(1)
    expect(result.urls[0].contentHash).toBe('hash-a')
    expect(result.urls[0].uploadUrl).toMatch(/^https?:\/\//)
  })

  it('upserts release-scoped templates, criteria, and items idempotently', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    const oldTemplateId = await seedTemplateWithItem(
      t,
      authorId,
      'gaming:ssbu-fighters',
      ['old-release-item']
    )
    await seedMediaVariant(t, authorId, 'hash-cover')
    await seedMediaVariant(t, authorId, 'hash-mario')
    await seedMediaVariant(t, authorId, 'hash-link')

    enableSeedApi()
    const templateInput = {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-apply',
      authorEmail: AUTHOR_EMAIL,
      templates: [
        {
          externalId: 'gaming:ssbu-fighters',
          title: 'SSBU roster',
          category: 'gaming' as const,
          description: 'Playable fighters.',
          tags: ['Nintendo', 'smash'],
          visibility: 'public' as const,
          coverMediaContentHash: 'hash-cover',
          coverFraming: null,
          suggestedTiers: [
            { name: 'S', colorSpec: { kind: 'palette' as const, index: 0 } },
          ],
          itemAspectRatio: 1,
          itemCount: 2,
        },
      ],
    }
    const createdTemplates = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedTemplates,
      templateInput
    )
    const unchangedTemplates = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedTemplates,
      templateInput
    )
    const updatedTemplates = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedTemplates,
      {
        ...templateInput,
        templates: [{ ...templateInput.templates[0], title: 'SSBU fighters' }],
      }
    )
    await expect(
      t.mutation(internal.marketplace.seedRuns.upsertSeedTemplates, {
        ...templateInput,
        templates: [templateInput.templates[0], templateInput.templates[0]],
      })
    ).rejects.toThrow(/duplicate seed template externalId/)

    expect(createdTemplates).toMatchObject({
      created: ['gaming:ssbu-fighters'],
      updated: [],
      unchanged: [],
    })
    expect(unchangedTemplates.unchanged).toEqual(['gaming:ssbu-fighters'])
    expect(updatedTemplates.updated).toEqual(['gaming:ssbu-fighters'])

    const criteriaResult = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedCriteria,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-apply',
        criteria: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            criterionExternalId: 'competitive',
            name: 'Competitive',
            shortName: 'Comp',
            prompt: 'Rank by competitive viability.',
            axisTop: 'Strongest',
            axisBottom: 'Weakest',
            order: 0,
            isPrimary: true,
            status: 'active' as const,
          },
          {
            templateExternalId: 'gaming:ssbu-fighters',
            criterionExternalId: 'favorites',
            name: 'Favorites',
            shortName: 'Favs',
            prompt: 'Rank by preference.',
            axisTop: 'Favorite',
            axisBottom: 'Least favorite',
            order: 1,
            isPrimary: false,
            status: 'active' as const,
          },
        ],
      }
    )
    expect(criteriaResult.created).toEqual([
      {
        templateExternalId: 'gaming:ssbu-fighters',
        criterionExternalId: 'competitive',
      },
      {
        templateExternalId: 'gaming:ssbu-fighters',
        criterionExternalId: 'favorites',
      },
    ])
    expect(criteriaResult.deactivated).toEqual([
      {
        templateExternalId: 'gaming:ssbu-fighters',
        criterionExternalId: 'default',
      },
    ])

    const firstItems = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedItems,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-apply',
        items: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'mario',
            order: 0,
            label: 'Mario',
            mediaContentHash: 'hash-mario',
            aspectRatio: 1,
            transform: null,
          },
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'link',
            order: 1,
            label: 'Link',
            mediaContentHash: 'hash-link',
            aspectRatio: 1,
            transform: null,
          },
        ],
      }
    )
    const sameItems = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedItems,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-apply',
        items: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'mario',
            order: 0,
            label: 'Mario',
            mediaContentHash: 'hash-mario',
            aspectRatio: 1,
            transform: null,
          },
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'link',
            order: 1,
            label: 'Link',
            mediaContentHash: 'hash-link',
            aspectRatio: 1,
            transform: null,
          },
        ],
      }
    )
    await expect(
      t.mutation(internal.marketplace.seedRuns.upsertSeedItems, {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-apply',
        items: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'mario',
            order: 0,
            label: 'Mario',
            mediaContentHash: 'hash-mario',
            aspectRatio: 1,
            transform: null,
          },
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'mario',
            order: 1,
            label: 'Mario duplicate',
            mediaContentHash: 'hash-mario',
            aspectRatio: 1,
            transform: null,
          },
        ],
      })
    ).rejects.toThrow(/duplicate seed item key/)
    const changedItems = await t.mutation(
      internal.marketplace.seedRuns.upsertSeedItems,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-apply',
        items: [
          {
            templateExternalId: 'gaming:ssbu-fighters',
            itemExternalId: 'mario',
            order: 1,
            label: 'Super Mario',
            mediaContentHash: 'hash-mario',
            aspectRatio: 1,
            transform: null,
          },
        ],
      }
    )

    expect(firstItems.created).toHaveLength(2)
    expect(sameItems.unchanged).toHaveLength(2)
    expect(changedItems.moved).toEqual([
      { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'mario' },
    ])
    expect(changedItems.updated).toEqual([
      { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'mario' },
    ])
    expect(changedItems.absentFromRelease).toEqual([
      { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'link' },
    ])

    const rows = await t.run(async (ctx) =>
    {
      const target = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:ssbu-fighters')
        )
        .unique()
      const old = await ctx.db.get(oldTemplateId)
      const targetItems = target
        ? await ctx.db
            .query('templateItems')
            .withIndex('byTemplate', (q) => q.eq('templateId', target._id))
            .collect()
        : []
      return { old, target, targetItems }
    })
    expect(rows.old?.seedReleaseId).toBe('2026-04-old-release')
    expect(rows.target).toMatchObject({
      seedReleaseId: RELEASE,
      title: 'SSBU fighters',
      publicationState: 'unpublished',
      isPubliclyListable: false,
      itemCount: 1,
    })
    expect(rows.targetItems).toMatchObject([
      { externalId: 'mario', label: 'Super Mario', order: 1 },
    ])
    expect(rows.target?.coverItems).toHaveLength(1)
  })

  it('verifies, activates, and rolls back seed releases', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    const oldRelease = '2026-04-old-release'
    const oldTemplateId = await seedTemplateWithItem(
      t,
      authorId,
      'gaming:ssbu-fighters',
      ['old-release-item'],
      oldRelease
    )
    await seedRunRow(t, oldRelease, 'active', 'old-active-run')
    const staleRelease = '2026-03-stale-release'
    const staleTemplateId = await seedTemplateWithItem(
      t,
      authorId,
      'gaming:stale-template',
      ['stale-item'],
      staleRelease
    )
    await seedRunRow(t, staleRelease, 'active', 'stale-active-run')
    await seedMediaVariant(t, authorId, 'hash-cover')
    await seedMediaVariant(t, authorId, 'hash-mario')
    await seedMediaVariant(t, authorId, 'hash-link')

    enableSeedApi()
    await t.mutation(internal.marketplace.seedRuns.beginSeedRun, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      templateCount: 1,
      itemCount: 2,
      imageVariantCount: 6,
    })
    await t.mutation(internal.marketplace.seedRuns.upsertSeedTemplates, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      authorEmail: AUTHOR_EMAIL,
      templates: [
        {
          externalId: 'gaming:ssbu-fighters',
          title: 'SSBU fighters',
          category: 'gaming',
          description: 'Playable fighters.',
          tags: ['nintendo'],
          visibility: 'public',
          coverMediaContentHash: 'hash-cover',
          coverFraming: null,
          suggestedTiers: [
            { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
          ],
          itemAspectRatio: 1,
          itemCount: 2,
        },
      ],
    })
    await t.mutation(internal.marketplace.seedRuns.upsertSeedCriteria, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      criteria: [
        {
          templateExternalId: 'gaming:ssbu-fighters',
          criterionExternalId: 'competitive',
          name: 'Competitive',
          shortName: 'Comp',
          prompt: 'Rank by competitive viability.',
          axisTop: 'Strongest',
          axisBottom: 'Weakest',
          order: 0,
          isPrimary: true,
          status: 'active',
        },
      ],
    })
    await t.mutation(internal.marketplace.seedRuns.upsertSeedItems, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      items: [
        {
          templateExternalId: 'gaming:ssbu-fighters',
          itemExternalId: 'mario',
          order: 0,
          label: 'Mario',
          mediaContentHash: 'hash-mario',
          aspectRatio: 1,
          transform: null,
        },
        {
          templateExternalId: 'gaming:ssbu-fighters',
          itemExternalId: 'link',
          order: 1,
          label: 'Link',
          mediaContentHash: 'hash-link',
          aspectRatio: 1,
          transform: null,
        },
      ],
    })

    const verified = await t.mutation(
      internal.marketplace.seedRuns.verifySeedRelease,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        expectedTotals: {
          templateCount: 1,
          itemCount: 2,
          criterionCount: 1,
          sourceImageCount: 3,
          variantCount: 6,
          estimatedUploadBytes: 0,
          estimatedStorageBytes: 0,
        },
      }
    )
    expect(verified).toEqual({ verified: true, diagnostics: [] })
    await expect(
      t.mutation(internal.marketplace.seedRuns.activateSeedRelease, {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        previousReleaseId: null,
        confirm: true,
      })
    ).rejects.toThrow(/active seed release changed/)

    const activated = await t.mutation(
      internal.marketplace.seedRuns.activateSeedRelease,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        previousReleaseId: oldRelease,
        confirm: true,
      }
    )
    const activatedRows = await t.run(async (ctx) =>
    {
      const target = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:ssbu-fighters')
        )
        .unique()
      const old = await ctx.db.get(oldTemplateId)
      const stale = await ctx.db.get(staleTemplateId)
      const run = await ctx.db
        .query('seedRuns')
        .withIndex('byRunId', (q) => q.eq('runId', 'run-activation'))
        .unique()
      const stats = await ctx.db
        .query('marketplaceStats')
        .withIndex('byKey', (q) => q.eq('key', 'templates'))
        .unique()
      return { old, run, stale, stats, target }
    })
    expect(activated).toEqual({
      activeReleaseId: RELEASE,
      previousReleaseId: oldRelease,
    })
    expect(activatedRows.target).toMatchObject({
      publicationState: 'published',
      isPubliclyListable: true,
      seedReleaseStatus: 'active',
    })
    expect(activatedRows.old).toMatchObject({
      publicationState: 'unpublished',
      isPubliclyListable: false,
      seedReleaseStatus: 'rolled_back',
    })
    expect(activatedRows.stale).toMatchObject({
      publicationState: 'unpublished',
      isPubliclyListable: false,
      seedReleaseStatus: 'rolled_back',
    })
    expect(activatedRows.run?.status).toBe('active')
    expect(activatedRows.stats?.publicTemplateCount).toBe(1)

    await t.mutation(internal.marketplace.seedRuns.upsertSeedItems, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      items: [
        {
          templateExternalId: 'gaming:ssbu-fighters',
          itemExternalId: 'mario',
          order: 0,
          label: 'Super Mario',
          mediaContentHash: 'hash-mario',
          aspectRatio: 1,
          transform: null,
        },
        {
          templateExternalId: 'gaming:ssbu-fighters',
          itemExternalId: 'link',
          order: 1,
          label: 'Link',
          mediaContentHash: 'hash-link',
          aspectRatio: 1,
          transform: null,
        },
      ],
    })
    await t.mutation(internal.marketplace.seedRuns.upsertSeedCriteria, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      criteria: [
        {
          templateExternalId: 'gaming:ssbu-fighters',
          criterionExternalId: 'competitive',
          name: 'Competitive',
          shortName: 'Comp',
          prompt: 'Rank active release edits.',
          axisTop: 'Strongest',
          axisBottom: 'Weakest',
          order: 0,
          isPrimary: true,
          status: 'active',
        },
      ],
    })
    const activeAfterReupsert = await t.run(
      async (ctx) =>
        await ctx.db
          .query('templates')
          .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
            q
              .eq('seedDatasetKey', DATASET)
              .eq('seedReleaseId', RELEASE)
              .eq('seedExternalId', 'gaming:ssbu-fighters')
          )
          .unique()
    )
    expect(activeAfterReupsert).toMatchObject({
      publicationState: 'published',
      isPubliclyListable: true,
      seedReleaseStatus: 'active',
      itemCount: 2,
    })
    await t.mutation(internal.marketplace.seedRuns.upsertSeedTemplates, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      authorEmail: AUTHOR_EMAIL,
      templates: [
        {
          externalId: 'gaming:ssbu-fighters',
          title: 'SSBU fighters',
          category: 'movies',
          description: 'Playable fighters.',
          tags: ['nintendo'],
          visibility: 'public',
          coverMediaContentHash: 'hash-cover',
          coverFraming: null,
          suggestedTiers: [
            { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
          ],
          itemAspectRatio: 1,
          itemCount: 2,
        },
        {
          externalId: 'gaming:new-active-template',
          title: 'New active template',
          category: 'gaming',
          description: 'Added after activation.',
          tags: ['new'],
          visibility: 'public',
          coverMediaContentHash: null,
          coverFraming: null,
          suggestedTiers: [
            { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
          ],
          itemAspectRatio: 1,
          itemCount: 1,
        },
      ],
    })
    const activeTemplateStats = await t.run(async (ctx) =>
    {
      const stats = await ctx.db
        .query('marketplaceStats')
        .withIndex('byKey', (q) => q.eq('key', 'templates'))
        .unique()
      const newTemplate = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:new-active-template')
        )
        .unique()
      return { newTemplate, stats }
    })
    expect(activeTemplateStats.newTemplate).toMatchObject({
      publicationState: 'published',
      isPubliclyListable: true,
      seedReleaseStatus: 'active',
    })
    expect(activeTemplateStats.stats?.publicTemplateCount).toBe(2)
    expect(activeTemplateStats.stats?.publicTemplateCountByCategory).toEqual({
      gaming: 1,
      movies: 1,
    })

    const failedActiveVerify = await t.mutation(
      internal.marketplace.seedRuns.verifySeedRelease,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        expectedTotals: {
          templateCount: 1,
          itemCount: 99,
          criterionCount: 1,
          sourceImageCount: 3,
          variantCount: 6,
          estimatedUploadBytes: 0,
          estimatedStorageBytes: 0,
        },
      }
    )
    const activeRunAfterFailedVerify = await t.run(
      async (ctx) =>
        await ctx.db
          .query('seedRuns')
          .withIndex('byRunId', (q) => q.eq('runId', 'run-activation'))
          .unique()
    )
    expect(failedActiveVerify.verified).toBe(false)
    expect(activeRunAfterFailedVerify?.status).toBe('active')

    const buildingRelease = '2026-06-building-release'
    await seedTemplateWithItem(
      t,
      authorId,
      'gaming:future-template',
      ['future-item'],
      buildingRelease
    )
    await seedRunRow(t, buildingRelease, 'building', 'building-run')
    await expect(
      t.mutation(internal.marketplace.seedRuns.rollbackSeedRelease, {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        targetReleaseId: buildingRelease,
        confirm: true,
      })
    ).rejects.toThrow(/no restorable seed run/)

    const rolledBack = await t.mutation(
      internal.marketplace.seedRuns.rollbackSeedRelease,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        targetReleaseId: oldRelease,
        confirm: true,
      }
    )
    const rolledBackRows = await t.run(async (ctx) =>
    {
      const target = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:ssbu-fighters')
        )
        .unique()
      const old = await ctx.db.get(oldTemplateId)
      return { old, target }
    })
    expect(rolledBack).toEqual({
      activeReleaseId: oldRelease,
      rolledBackReleaseId: RELEASE,
    })
    expect(rolledBackRows.old).toMatchObject({
      publicationState: 'published',
      isPubliclyListable: true,
      seedReleaseStatus: 'active',
    })
    expect(rolledBackRows.target).toMatchObject({
      publicationState: 'unpublished',
      isPubliclyListable: false,
      seedReleaseStatus: 'rolled_back',
    })
  })

  it('finalizes, reuses, rejects, and cleans seed uploads', async () =>
  {
    const t = makeTest()
    await seedUser(t, AUTHOR_EMAIL)
    await seedRunRow(t, RELEASE, 'building', 'run-finalize')
    const bytes = buildPngHeader(32, 16)
    const contentHash = await sha256Hex(bytes)
    const storageId = await storeImageBytes(t, bytes)

    enableSeedApi()
    await expect(
      t.action(internal.marketplace.seedRuns.finalizeSeedUploadedMedia, {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        authorEmail: AUTHOR_EMAIL,
        assets: [],
      })
    ).rejects.toThrow(/assets must include 1..64 entries/)

    const first = await t.action(
      internal.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        authorEmail: AUTHOR_EMAIL,
        assets: [
          {
            assetKey: 'asset-1',
            variants: [
              {
                contentHash,
                storageId,
                kind: 'tile',
                expectedMimeType: 'image/png',
                expectedByteSize: bytes.byteLength,
                expectedWidth: 32,
                expectedHeight: 16,
              },
            ],
          },
        ],
      }
    )
    expect(first.rejected).toEqual([])
    expect(first.finalized).toMatchObject([
      { assetKey: 'asset-1', contentHashes: [contentHash], reused: false },
    ])

    const duplicateStorageId = await storeImageBytes(t, bytes)
    const second = await t.action(
      internal.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        authorEmail: AUTHOR_EMAIL,
        assets: [
          {
            assetKey: 'asset-2',
            variants: [
              {
                contentHash,
                storageId: duplicateStorageId,
                kind: 'tile',
                expectedMimeType: 'image/png',
                expectedByteSize: bytes.byteLength,
                expectedWidth: 32,
                expectedHeight: 16,
              },
            ],
          },
        ],
      }
    )
    expect(second.finalized[0].mediaAssetId).toBe(
      first.finalized[0].mediaAssetId
    )
    expect(second.finalized[0].reused).toBe(true)

    const badStorageId = await storeImageBytes(t, bytes)
    const rejected = await t.action(
      internal.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        authorEmail: AUTHOR_EMAIL,
        assets: [
          {
            assetKey: 'bad-asset',
            variants: [
              {
                contentHash: 'not-the-real-hash',
                storageId: badStorageId,
                kind: 'tile',
                expectedMimeType: 'image/png',
                expectedByteSize: bytes.byteLength,
                expectedWidth: 32,
                expectedHeight: 16,
              },
            ],
          },
        ],
      }
    )
    expect(rejected.finalized).toEqual([])
    expect(rejected.rejected).toMatchObject([
      {
        assetKey: 'bad-asset',
        contentHash: 'not-the-real-hash',
        cleaned: true,
      },
    ])
    await expectStorageMissing(t, badStorageId)

    const badMetadataStorageId = await storeImageBytes(t, bytes)
    const metadataRejected = await t.action(
      internal.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        authorEmail: AUTHOR_EMAIL,
        assets: [
          {
            assetKey: 'bad-metadata',
            variants: [
              {
                contentHash,
                storageId: badMetadataStorageId,
                kind: 'tile',
                expectedMimeType: 'image/png',
                expectedByteSize: bytes.byteLength,
                expectedWidth: 99,
                expectedHeight: 16,
              },
            ],
          },
        ],
      }
    )
    expect(metadataRejected.finalized).toEqual([])
    expect(metadataRejected.rejected).toMatchObject([
      {
        assetKey: 'bad-metadata',
        contentHash,
        reason: expect.stringContaining('width'),
        cleaned: true,
      },
    ])
    await expectStorageMissing(t, badMetadataStorageId)

    const abandonedStorageId = await storeImageBytes(t, bytes)
    await t.mutation(
      internal.marketplace.seedPipeline.storageUploads
        .registerSeedUploadedStorageIds,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        storageIds: [abandonedStorageId],
      }
    )
    const cleanup = await t.action(
      internal.marketplace.seedPipeline.storageUploads.cleanupAbandonedSeedRun,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        storageIds: [abandonedStorageId, badStorageId],
      }
    )
    expect(cleanup.cleanedStorageIds).toEqual([abandonedStorageId])
    expect(cleanup.missingStorageIds).toEqual([])
    expect(cleanup.skippedStorageIds).toEqual([badStorageId])
    await expectStorageMissing(t, abandonedStorageId)
  })
})
