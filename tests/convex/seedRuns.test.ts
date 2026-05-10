// tests/convex/seedRuns.test.ts
// Convex seed-run precheck API authorization & state resolution

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import schema from '../../convex/schema'
import { sha256Hex } from '../../convex/lib/sha256'
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

const buildPngHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  bytes[16] = (width >>> 24) & 0xff
  bytes[17] = (width >>> 16) & 0xff
  bytes[18] = (width >>> 8) & 0xff
  bytes[19] = width & 0xff
  bytes[20] = (height >>> 24) & 0xff
  bytes[21] = (height >>> 16) & 0xff
  bytes[22] = (height >>> 8) & 0xff
  bytes[23] = height & 0xff
  return bytes
}

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
    await expect(
      t.mutation(api.marketplace.seedRuns.beginSeedRun, {
        seedSecret: SEED_SECRET,
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'bad-run',
        templateCount: -1,
        itemCount: 5,
        imageVariantCount: 10,
      })
    ).rejects.toThrow(/templateCount must be a nonnegative integer/)

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

  it('generates upload URLs behind the seed gate', async () =>
  {
    const t = makeTest()
    await expect(
      t.mutation(api.marketplace.seedRuns.generateSeedUploadUrls, {
        seedSecret: SEED_SECRET,
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
      })
    ).rejects.toThrow(/seeding is disabled/)

    enableSeedApi()
    await expect(
      t.mutation(api.marketplace.seedRuns.generateSeedUploadUrls, {
        seedSecret: SEED_SECRET,
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-uploads',
        variants: [],
      })
    ).rejects.toThrow(/variants must include 1..128 entries/)

    const result = await t.mutation(
      api.marketplace.seedRuns.generateSeedUploadUrls,
      {
        seedSecret: SEED_SECRET,
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

  it('finalizes, reuses, rejects, and cleans seed uploads', async () =>
  {
    const t = makeTest()
    await seedUser(t, AUTHOR_EMAIL)
    const bytes = buildPngHeader(32, 16)
    const contentHash = await sha256Hex(bytes)
    const storageId = await storeImageBytes(t, bytes)

    enableSeedApi()
    await expect(
      t.action(api.marketplace.seedRuns.finalizeSeedUploadedMedia, {
        seedSecret: SEED_SECRET,
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        authorEmail: AUTHOR_EMAIL,
        assets: [],
      })
    ).rejects.toThrow(/assets must include 1..64 entries/)

    const first = await t.action(
      api.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        seedSecret: SEED_SECRET,
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
      api.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        seedSecret: SEED_SECRET,
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
      api.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        seedSecret: SEED_SECRET,
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
      { contentHash: 'not-the-real-hash', cleaned: true },
    ])
    await expectStorageMissing(t, badStorageId)

    const badMetadataStorageId = await storeImageBytes(t, bytes)
    const metadataRejected = await t.action(
      api.marketplace.seedRuns.finalizeSeedUploadedMedia,
      {
        seedSecret: SEED_SECRET,
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
      { contentHash, reason: expect.stringContaining('width'), cleaned: true },
    ])
    await expectStorageMissing(t, badMetadataStorageId)

    const abandonedStorageId = await storeImageBytes(t, bytes)
    const cleanup = await t.action(
      api.marketplace.seedRuns.cleanupAbandonedSeedRun,
      {
        seedSecret: SEED_SECRET,
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        storageIds: [abandonedStorageId, badStorageId],
      }
    )
    expect(cleanup.cleanedStorageIds).toEqual([abandonedStorageId])
    expect(cleanup.missingStorageIds).toEqual([badStorageId])
    await expectStorageMissing(t, abandonedStorageId)
  })
})
