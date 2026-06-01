// tests/convex/seedRuns.test.ts
// Convex seed-run precheck API authorization & state resolution

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { internal } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import { sha256Hex } from '../../convex/lib/sha256'
import { computeVariantDedupeHash } from '../../convex/lib/mediaVariants'
import {
  buildPngHeader,
  captureSeedEnv,
  type ConvexTestHandle,
  enableSeedApi,
  makeRateLimitedTest as makeTest,
  restoreSeedEnv,
  seedPublishedTemplate,
  seedTileMediaAsset,
  seedUser,
  TEST_CRITERIA,
} from '@tests/convex/convexTestHelpers'

const SEED_SECRET = 'test-seed-secret'
const DATASET = 'marketplace-core'
const RELEASE = '2026-05-templates-v1'
const AUTHOR_EMAIL = 'seed@example.com'

const originalEnv = captureSeedEnv()

const restoreEnv = (): void =>
{
  restoreSeedEnv(originalEnv)
}

const seedHttpPost = async (
  t: ConvexTestHandle,
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

const criteria = TEST_CRITERIA.slice(0, 1)

const withCriteriaContentHash = <
  T extends { templateExternalId: string; criterionExternalId: string },
>(
  rows: readonly T[],
  criteriaContentHash: string
): Array<T & { criteriaContentHash: string }> =>
  rows.map((row) => ({ ...row, criteriaContentHash }))

interface SeedTemplateInput
{
  externalId: string
  metadataContentHash: string
  title: string
  category: 'gaming' | 'movies'
  description: string
  tags: string[]
  visibility: 'public' | 'unlisted'
  coverMediaDedupeHash: string | null
  coverFraming: null
  suggestedTiers: Array<{
    name: string
    colorSpec: { kind: 'palette'; index: number }
  }>
  itemAspectRatio: number
  defaultItemImagePadding: number | null
  itemCount: number
  labels?: { show: boolean }
  autoPlate?: { mode: 'uniform'; uniformColor: string }
  styles?: SeedTemplateStyleInput[]
  defaultStyleId?: string | null
}

interface SeedTemplateStyleInput
{
  externalId: string
  label: string
  order: number
  isDefault: boolean
  coverMediaDedupeHash: string | null
  itemAspectRatio: number | null
  defaultItemImagePadding: number | null
  labels?: { show: boolean }
  autoPlate?: { mode: 'uniform'; uniformColor: string }
}

interface SeedItemInput
{
  itemExternalId: string
  order: number
  label: string
  mediaDedupeHash: string
  aspectRatio: number
  transform: ItemTransform | null
  mediaPlate: null
  imagePadding: number | null
  backgroundColor: string | null
}

interface SeedStyleItemInput
{
  itemExternalId: string
  mediaDedupeHash: string | null
  aspectRatio: number | null
  transform: ItemTransform | null
  mediaPlate: null
  imagePadding: number | null
}

const buildSeedTemplate = (
  overrides: Partial<SeedTemplateInput> = {}
): SeedTemplateInput => ({
  externalId: 'gaming:ssbu-fighters',
  metadataContentHash: 'meta-ssbu-v1',
  title: 'SSBU fighters',
  category: 'gaming',
  description: 'Playable fighters.',
  tags: ['nintendo'],
  visibility: 'public',
  coverMediaDedupeHash: null,
  coverFraming: null,
  suggestedTiers: [{ name: 'S', colorSpec: { kind: 'palette', index: 0 } }],
  itemAspectRatio: 1,
  defaultItemImagePadding: null,
  itemCount: 1,
  ...overrides,
})

const buildSeedTemplateInput = (args: {
  runId: string
  templates?: SeedTemplateInput[]
  template?: Partial<SeedTemplateInput>
}) => ({
  datasetKey: DATASET,
  releaseId: RELEASE,
  runId: args.runId,
  authorEmail: AUTHOR_EMAIL,
  templates: args.templates ?? [buildSeedTemplate(args.template)],
})

const seedItem = (
  itemExternalId: string,
  order: number,
  overrides: Partial<Omit<SeedItemInput, 'itemExternalId' | 'order'>> = {}
): SeedItemInput => ({
  itemExternalId,
  order,
  label: itemExternalId,
  mediaDedupeHash: `tile:hash-${itemExternalId}`,
  aspectRatio: 1,
  transform: null,
  mediaPlate: null,
  imagePadding: null,
  backgroundColor: null,
  ...overrides,
})

const buildSeedItemsInput = (args: {
  runId: string
  templateExternalId?: string
  itemsContentHash: string
  items: SeedItemInput[]
  allowContentHashSkip?: boolean
}) => ({
  datasetKey: DATASET,
  releaseId: RELEASE,
  runId: args.runId,
  templateExternalId: args.templateExternalId ?? 'gaming:ssbu-fighters',
  itemsContentHash: args.itemsContentHash,
  ...(args.allowContentHashSkip !== undefined
    ? { allowContentHashSkip: args.allowContentHashSkip }
    : {}),
  items: args.items,
})

const seedStyleItem = (
  itemExternalId: string,
  overrides: Partial<Omit<SeedStyleItemInput, 'itemExternalId'>> = {}
): SeedStyleItemInput => ({
  itemExternalId,
  mediaDedupeHash: null,
  aspectRatio: 1,
  transform: null,
  mediaPlate: null,
  imagePadding: null,
  ...overrides,
})

const getSeedTemplate = async (
  t: ConvexTestHandle,
  externalId: string,
  releaseId = RELEASE
): Promise<Doc<'templates'> | null> =>
  await t.run(
    async (ctx) =>
      await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', releaseId)
            .eq('seedExternalId', externalId)
        )
        .unique()
  )

const seedTemplateWithItem = async (
  t: ConvexTestHandle,
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
          imagePadding: null,
        })
      )
    )
    return templateId
  })

const seedMediaVariant = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>,
  contentHash: string
): Promise<Doc<'mediaVariants'>> =>
  await t.run(async (ctx) =>
  {
    const { mediaVariantId } = await seedTileMediaAsset(ctx, {
      ownerId,
      externalId: `media-${contentHash}`,
      dedupeHash: computeVariantDedupeHash([{ kind: 'tile', contentHash }]),
      contentHash,
    })
    const variant = await ctx.db.get(mediaVariantId)
    if (!variant) throw new Error('media variant missing')
    return variant
  })

const seedMediaAssetWithTileAndPreview = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>,
  externalId: string,
  tileHash: string,
  previewHash: string
): Promise<{ mediaAssetId: Id<'mediaAssets'>; dedupeHash: string }> =>
  await t.run(async (ctx) =>
  {
    const [tileStorageId, previewStorageId] = await Promise.all([
      ctx.storage.store(
        new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
      ),
      ctx.storage.store(
        new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' })
      ),
    ])
    const variants = [
      { kind: 'tile' as const, contentHash: tileHash },
      { kind: 'preview' as const, contentHash: previewHash },
    ]
    const dedupeHash = computeVariantDedupeHash(variants)
    const now = Date.now()
    const { mediaAssetId } = await seedTileMediaAsset(ctx, {
      ownerId,
      externalId,
      dedupeHash,
      storageId: tileStorageId,
      contentHash: tileHash,
      createdAt: now,
    })
    const previewVariant = {
      storageId: previewStorageId,
      width: 64,
      height: 64,
      byteSize: 3,
      mimeType: 'image/jpeg',
      contentHash: previewHash,
    }
    await Promise.all([
      ctx.db.patch(mediaAssetId, { previewVariant }),
      ctx.db.insert('mediaVariants', {
        mediaAssetId,
        kind: 'preview',
        ...previewVariant,
        createdAt: now,
      }),
    ])
    return { mediaAssetId, dedupeHash }
  })

const runChunkedSeedVerification = async (
  t: ConvexTestHandle,
  args: {
    datasetKey: string
    releaseId: string
    runId: string
    templateExternalIds: readonly string[]
    expectedTotals: {
      templateCount: number
      itemCount: number
      criterionCount: number
      sourceImageCount: number
      variantCount: number
      estimatedUploadBytes: number
      estimatedStorageBytes: number
    }
  }
): Promise<{
  verified: boolean
  diagnostics: Array<{
    code: string
    message: string
    path: string
    severity: 'warning' | 'error'
  }>
}> =>
{
  const chunk = await t.mutation(
    internal.marketplace.seed.templates.endpoints.verifySeedReleaseChunk,
    {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      runId: args.runId,
      templateExternalIds: [...args.templateExternalIds],
    }
  )
  return await t.mutation(
    internal.marketplace.seed.templates.endpoints
      .completeSeedReleaseVerification,
    {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      runId: args.runId,
      expectedTotals: args.expectedTotals,
      actualTotals: chunk.totals,
      diagnostics: chunk.diagnostics,
    }
  )
}

const seedRunRow = async (
  t: ConvexTestHandle,
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
  t: ConvexTestHandle,
  bytes: Uint8Array<ArrayBuffer>
): Promise<Id<'_storage'>> =>
  await t.run(
    async (ctx) =>
      await ctx.storage.store(new Blob([bytes], { type: 'image/png' }))
  )

const expectStorageMissing = async (
  t: ConvexTestHandle,
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
    expect(disabled.status).toBe(403)
    await expect(disabled.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is disabled'),
    })

    enableSeedApi(SEED_SECRET)
    const wrongSecret = await seedHttpPost(
      t,
      '/api/seed/begin',
      runArgs,
      'wrong-secret'
    )
    expect(wrongSecret.status).toBe(403)
    await expect(wrongSecret.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is locked'),
    })
    const tooLarge = await seedHttpPost(t, '/api/seed/upload-urls', {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-too-large',
      variants: [
        {
          contentHash: 'hash-too-large',
          kind: 'tile',
          mimeType: 'image/png',
          byteSize: Number.MAX_SAFE_INTEGER,
        },
      ],
    })
    expect(tooLarge.status).toBe(413)
    await expect(tooLarge.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.payloadTooLarge,
      errorMessage: expect.stringContaining('too large'),
    })

    await expect(
      t.mutation(internal.marketplace.seed.templates.endpoints.beginSeedRun, {
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

  it('resolves active release, external IDs, and criteria for the manifest scope', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    await seedTemplateWithItem(
      t,
      authorId,
      'gaming:ssbu-fighters',
      ['mario'],
      RELEASE
    )
    await seedRunRow(t, '2026-04-old-release', 'active', 'active-run')

    enableSeedApi(SEED_SECRET)
    const state = await t.query(
      internal.marketplace.seed.templates.endpoints.resolveSeedState,
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
  })

  it('resolves media hashes only for the seed author', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    const otherId = await seedUser(t, 'other@example.com')
    const authorVariant = await seedMediaVariant(t, authorId, 'hash-present')
    await seedMediaVariant(t, otherId, 'hash-present')

    const result = await t.query(
      internal.marketplace.seed.templates.endpoints.resolveSeedMediaByHashes,
      {
        authorEmail: AUTHOR_EMAIL,
        variantHashes: ['hash-present', 'hash-present', 'hash-missing'],
      }
    )

    expect(result.media).toEqual([
      {
        contentHash: 'hash-present',
        mediaAssetId: authorVariant.mediaAssetId,
        mediaDedupeHash: 'tile:hash-present',
        variantKind: 'tile',
        byteSize: 3,
      },
    ])
  })

  it('generates upload URLs and validates batch bounds', async () =>
  {
    const t = makeTest()
    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.generateSeedUploadUrls,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          runId: 'run-uploads',
          variants: [],
        }
      )
    ).rejects.toThrow(/variants must include 1..128 entries/)

    const result = await t.mutation(
      internal.marketplace.seed.templates.endpoints.generateSeedUploadUrls,
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

  it('persists seed template label defaults', async () =>
  {
    const t = makeTest()
    await seedUser(t, AUTHOR_EMAIL)

    const templateInput = buildSeedTemplateInput({
      runId: 'run-labels',
      template: {
        externalId: 'gaming:labelled-template',
        metadataContentHash: 'meta-labels-hidden',
        title: 'Labelled template',
        description: 'Template with seed label defaults.',
        tags: ['labels'],
        labels: { show: false },
      },
    })

    const created = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      templateInput
    )
    const updated = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      {
        ...templateInput,
        templates: [
          {
            ...templateInput.templates[0],
            metadataContentHash: 'meta-labels-visible',
            labels: { show: true },
          },
        ],
      }
    )

    const template = await getSeedTemplate(t, 'gaming:labelled-template')

    expect(created.created).toEqual(['gaming:labelled-template'])
    expect(updated.updated).toEqual(['gaming:labelled-template'])
    expect(template?.labels).toEqual({ show: true })
    expect(template?.seedMetadataContentHash).toBe('meta-labels-visible')
  })

  it('uses seed metadata hash as the template apply gate', async () =>
  {
    const t = makeTest()
    await seedUser(t, AUTHOR_EMAIL)

    const templateInput = buildSeedTemplateInput({
      runId: 'run-template-hash-gate',
      template: {
        externalId: 'gaming:hash-gated-template',
        metadataContentHash: 'meta-hash-gate-v1',
        title: 'Hash gated template',
      },
    })

    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      templateInput
    )
    const unchanged = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      {
        ...templateInput,
        templates: [
          {
            ...templateInput.templates[0],
            title: 'Ignored without a new hash',
          },
        ],
      }
    )
    const template = await getSeedTemplate(t, 'gaming:hash-gated-template')

    expect(unchanged.unchanged).toEqual(['gaming:hash-gated-template'])
    expect(template?.title).toBe('Hash gated template')
  })

  it('rejects malformed seed color values at the apply boundary', async () =>
  {
    const t = makeTest()
    await seedUser(t, AUTHOR_EMAIL)
    const templateInput = buildSeedTemplateInput({
      runId: 'run-colors',
      template: {
        externalId: 'gaming:color-template',
        metadataContentHash: 'meta-color-template',
        title: 'Color template',
        description: 'Color validation coverage.',
        tags: ['colors'],
      },
    })

    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
        {
          ...templateInput,
          templates: [
            {
              ...templateInput.templates[0],
              autoPlate: { mode: 'uniform' as const, uniformColor: 'white' },
            },
          ],
        }
      )
    ).rejects.toThrow(/autoPlate\.uniformColor must be a #rrggbb hex color/)

    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      templateInput
    )
    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          runId: 'run-colors',
          templateExternalId: 'gaming:color-template',
          itemsContentHash: 'items-color-template',
          items: [
            seedItem('mario', 0, {
              label: 'Mario',
              mediaDedupeHash: 'tile:hash-mario',
              backgroundColor: 'white',
            }),
          ],
        }
      )
    ).rejects.toThrow(/item\.backgroundColor must be a #rrggbb hex color/)

    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          runId: 'run-colors',
          templateExternalId: 'gaming:color-template',
          itemsContentHash: 'items-transform-color-template',
          items: [
            seedItem('mario', 0, {
              label: 'Mario',
              mediaDedupeHash: 'tile:hash-mario',
              transform: { rotation: 0, zoom: 50, offsetX: 0, offsetY: 0 },
            }),
          ],
        }
      )
    ).rejects.toThrow(/item\.transform\.zoom must be <= 10/)
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

    enableSeedApi(SEED_SECRET)
    const templateInput = buildSeedTemplateInput({
      runId: 'run-apply',
      template: {
        metadataContentHash: 'meta-ssbu-v1',
        title: 'SSBU roster',
        description: 'Playable fighters.',
        tags: ['Nintendo', 'smash'],
        coverMediaDedupeHash: 'tile:hash-cover',
        itemCount: 2,
      },
    })
    const createdTemplates = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      templateInput
    )
    const unchangedTemplates = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      templateInput
    )
    const updatedTemplates = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      {
        ...templateInput,
        templates: [
          {
            ...templateInput.templates[0],
            metadataContentHash: 'meta-ssbu-title-v2',
            title: 'SSBU fighters',
          },
        ],
      }
    )
    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
        {
          ...templateInput,
          templates: [templateInput.templates[0], templateInput.templates[0]],
        }
      )
    ).rejects.toThrow(/duplicate seed template externalId/)

    expect(createdTemplates).toMatchObject({
      created: ['gaming:ssbu-fighters'],
      updated: [],
      unchanged: [],
    })
    expect(unchangedTemplates.unchanged).toEqual(['gaming:ssbu-fighters'])
    expect(updatedTemplates.updated).toEqual(['gaming:ssbu-fighters'])

    const criteriaResult = await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedCriteria,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-apply',
        criteria: withCriteriaContentHash(
          [
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
          'criteria-ssbu-v1'
        ),
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
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-apply',
        itemsContentHash: 'items-ssbu-v1',
        allowContentHashSkip: true,
        items: [
          seedItem('mario', 0, {
            label: 'Mario',
            mediaDedupeHash: 'tile:hash-mario',
          }),
          seedItem('link', 1, {
            label: 'Link',
            mediaDedupeHash: 'tile:hash-link',
          }),
        ],
      })
    )
    await t.run(async (ctx) =>
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:ssbu-fighters')
        )
        .unique()
      if (!template) throw new Error('seed template missing')
      await ctx.db.patch(template._id, { updatedAt: 12345 })
    })
    const sameItems = await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-apply',
        itemsContentHash: 'items-ssbu-v1',
        allowContentHashSkip: true,
        items: [
          seedItem('mario', 0, {
            label: 'Mario',
            mediaDedupeHash: 'tile:hash-mario',
          }),
          seedItem('link', 1, {
            label: 'Link',
            mediaDedupeHash: 'tile:hash-link',
          }),
        ],
      })
    )
    const unchangedItemSyncTemplate = await getSeedTemplate(
      t,
      'gaming:ssbu-fighters'
    )
    await t.run(async (ctx) =>
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:ssbu-fighters')
        )
        .unique()
      if (!template) throw new Error('seed template missing')
      const item = await ctx.db
        .query('templateItems')
        .withIndex('byTemplateAndExternalId', (q) =>
          q.eq('templateId', template._id).eq('externalId', 'mario')
        )
        .unique()
      if (!item) throw new Error('seed item missing')
      await ctx.db.patch(item._id, { label: 'Drifted Mario' })
    })
    const forcedItems = await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-apply',
        itemsContentHash: 'items-ssbu-v1',
        allowContentHashSkip: false,
        items: [
          seedItem('mario', 0, {
            label: 'Mario',
            mediaDedupeHash: 'tile:hash-mario',
          }),
          seedItem('link', 1, {
            label: 'Link',
            mediaDedupeHash: 'tile:hash-link',
          }),
        ],
      })
    )
    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
        buildSeedItemsInput({
          runId: 'run-apply',
          itemsContentHash: 'items-duplicate',
          items: [
            seedItem('mario', 0, {
              label: 'Mario',
              mediaDedupeHash: 'tile:hash-mario',
            }),
            seedItem('mario', 1, {
              label: 'Mario duplicate',
              mediaDedupeHash: 'tile:hash-mario',
            }),
          ],
        })
      )
    ).rejects.toThrow(/duplicate seed item key/)
    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
        buildSeedItemsInput({
          runId: 'run-apply',
          itemsContentHash: 'items-wrong-count',
          items: [
            seedItem('mario', 1, {
              label: 'Super Mario',
              mediaDedupeHash: 'tile:hash-mario',
            }),
          ],
        })
      )
    ).rejects.toThrow(/expected 2 items, received 1/)
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      {
        ...templateInput,
        templates: [
          {
            ...templateInput.templates[0],
            metadataContentHash: 'meta-ssbu-one-item',
            title: 'SSBU fighters',
            itemCount: 1,
          },
        ],
      }
    )
    const changedItems = await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-apply',
        itemsContentHash: 'items-ssbu-v2',
        items: [
          seedItem('mario', 1, {
            label: 'Super Mario',
            mediaDedupeHash: 'tile:hash-mario',
          }),
        ],
      })
    )

    expect(firstItems.created).toHaveLength(2)
    expect(sameItems.unchanged).toHaveLength(2)
    expect(unchangedItemSyncTemplate?.updatedAt).toBe(12345)
    expect(forcedItems.updated).toEqual([
      { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'mario' },
    ])
    expect(changedItems.moved).toEqual([
      { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'mario' },
    ])
    expect(changedItems.updated).toEqual([
      { templateExternalId: 'gaming:ssbu-fighters', itemExternalId: 'mario' },
    ])
    expect(changedItems.deleted).toEqual([
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

  it('resolves seed item media by full dedupe identity', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    const stale = await seedMediaAssetWithTileAndPreview(
      t,
      authorId,
      'stale-shared-tile',
      'shared-tile',
      'old-preview'
    )
    const current = await seedMediaAssetWithTileAndPreview(
      t,
      authorId,
      'current-shared-tile',
      'shared-tile',
      'new-preview'
    )

    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      buildSeedTemplateInput({
        runId: 'run-dedupe-media',
        template: {
          metadataContentHash: 'meta-dedupe-media',
        },
      })
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-dedupe-media',
        itemsContentHash: 'items-dedupe-media',
        items: [
          seedItem('mario', 0, {
            label: 'Mario',
            mediaDedupeHash: current.dedupeHash,
          }),
        ],
      })
    )

    const template = await getSeedTemplate(t, 'gaming:ssbu-fighters')
    const row = await t.run(async (ctx) =>
    {
      if (!template) return null
      return await ctx.db
        .query('templateItems')
        .withIndex('byTemplateAndExternalId', (q) =>
          q.eq('templateId', template._id).eq('externalId', 'mario')
        )
        .unique()
    })
    expect(row?.mediaAssetId).toBe(current.mediaAssetId)
    expect(row?.mediaAssetId).not.toBe(stale.mediaAssetId)
  })

  it('stores style-item hashes and prunes child rows when styles are dropped', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    await seedMediaVariant(t, authorId, 'hash-mario')
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      buildSeedTemplateInput({
        runId: 'run-style-prune',
        template: {
          metadataContentHash: 'meta-style-prune-v1',
          defaultStyleId: 'default',
          styles: [
            {
              externalId: 'default',
              label: 'Default',
              order: 0,
              isDefault: true,
              coverMediaDedupeHash: null,
              itemAspectRatio: 1,
              defaultItemImagePadding: null,
            },
            {
              externalId: 'alt',
              label: 'Alt',
              order: 1,
              isDefault: false,
              coverMediaDedupeHash: null,
              itemAspectRatio: 1,
              defaultItemImagePadding: null,
            },
          ],
        },
      })
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-style-prune',
        itemsContentHash: 'items-style-prune',
        items: [seedItem('mario', 0, { mediaDedupeHash: 'tile:hash-mario' })],
      })
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateStyleItems,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-style-prune',
        templateExternalId: 'gaming:ssbu-fighters',
        styleExternalId: 'alt',
        styleItemsContentHash: 'v1:style-items-alt',
        items: [seedStyleItem('mario')],
      }
    )
    const syncedState = await t.query(
      internal.marketplace.seed.templates.endpoints.resolveSeedState,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        authorEmail: AUTHOR_EMAIL,
        templateExternalIds: ['gaming:ssbu-fighters'],
        itemExternalIds: [],
        criterionExternalIds: [],
        variantHashes: [],
      }
    )
    expect(syncedState.templates[0].styleItemsContentHash).toMatch(/^v1:/)

    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      buildSeedTemplateInput({
        runId: 'run-style-prune',
        template: {
          metadataContentHash: 'meta-style-prune-v2',
          defaultStyleId: null,
        },
      })
    )
    const rows = await t.run(async (ctx) =>
    {
      const template = await ctx.db
        .query('templates')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', 'gaming:ssbu-fighters')
        )
        .unique()
      if (!template) throw new Error('seed template missing')
      const styles = await ctx.db
        .query('templateStyles')
        .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
        .collect()
      const styleItems = await ctx.db
        .query('templateItemStyleAssets')
        .withIndex('byTemplateStyleAndItem', (q) =>
          q.eq('templateId', template._id)
        )
        .collect()
      return { styleItems, styles, template }
    })

    expect(rows.styles).toEqual([])
    expect(rows.styleItems).toEqual([])
    expect(rows.template.seedStyleItemsContentHash).toBeNull()
  })

  it('fails verification when the release still has stale template rows', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, AUTHOR_EMAIL)
    await seedTemplateWithItem(
      t,
      authorId,
      'gaming:planned-template',
      ['planned-item'],
      RELEASE
    )
    await seedTemplateWithItem(
      t,
      authorId,
      'gaming:stale-template',
      ['stale-item'],
      RELEASE
    )
    await seedRunRow(t, RELEASE, 'building', 'run-stale-template')

    const verified = await t.mutation(
      internal.marketplace.seed.templates.endpoints
        .completeSeedReleaseVerification,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-stale-template',
        expectedTotals: {
          templateCount: 1,
          itemCount: 1,
          criterionCount: 1,
          sourceImageCount: 0,
          variantCount: 0,
          estimatedUploadBytes: 0,
          estimatedStorageBytes: 0,
        },
        actualTotals: {
          templateCount: 1,
          itemCount: 1,
          criterionCount: 1,
        },
        diagnostics: [],
      }
    )
    const run = await t.run(
      async (ctx) =>
        await ctx.db
          .query('seedRuns')
          .withIndex('byRunId', (q) => q.eq('runId', 'run-stale-template'))
          .unique()
    )

    expect(verified.verified).toBe(false)
    expect(verified.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'releaseTemplateCountMismatch',
          message: expect.stringContaining('2 templates'),
        }),
      ])
    )
    expect(run?.status).toBe('failed')
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

    enableSeedApi(SEED_SECRET)
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.beginSeedRun,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        templateCount: 1,
        itemCount: 2,
        imageVariantCount: 6,
      }
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      buildSeedTemplateInput({
        runId: 'run-activation',
        template: {
          metadataContentHash: 'meta-activation-v1',
          coverMediaDedupeHash: 'tile:hash-cover',
          itemCount: 2,
        },
      })
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedCriteria,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        criteria: withCriteriaContentHash(
          [
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
          ],
          'criteria-activation-v1'
        ),
      }
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-activation',
        itemsContentHash: 'items-activation-v1',
        items: [
          seedItem('mario', 0, {
            label: 'Mario',
            mediaDedupeHash: 'tile:hash-mario',
          }),
          seedItem('link', 1, {
            label: 'Link',
            mediaDedupeHash: 'tile:hash-link',
          }),
        ],
      })
    )

    const verified = await runChunkedSeedVerification(t, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      templateExternalIds: ['gaming:ssbu-fighters'],
      expectedTotals: {
        templateCount: 1,
        itemCount: 2,
        criterionCount: 1,
        sourceImageCount: 3,
        variantCount: 6,
        estimatedUploadBytes: 0,
        estimatedStorageBytes: 0,
      },
    })
    expect(verified).toEqual({ verified: true, diagnostics: [] })
    await expect(
      t.mutation(
        internal.marketplace.seed.templates.endpoints.activateSeedRelease,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          runId: 'run-activation',
          previousReleaseId: null,
          confirm: true,
        }
      )
    ).rejects.toThrow(/active seed release changed/)

    const activated = await t.mutation(
      internal.marketplace.seed.templates.endpoints.activateSeedRelease,
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

    await seedRunRow(t, RELEASE, 'verified', 'run-activation-rerun')
    await t.run(async (ctx) =>
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
      if (!target) throw new Error('active seed template missing')
      await ctx.db.patch(target._id, { updatedAt: 22222 })
    })
    const reactivated = await t.mutation(
      internal.marketplace.seed.templates.endpoints.activateSeedRelease,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation-rerun',
        previousReleaseId: RELEASE,
        confirm: true,
      }
    )
    const reactivatedRows = await t.run(async (ctx) =>
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
      const run = await ctx.db
        .query('seedRuns')
        .withIndex('byRunId', (q) => q.eq('runId', 'run-activation-rerun'))
        .unique()
      return { run, target }
    })
    expect(reactivated).toEqual({
      activeReleaseId: RELEASE,
      previousReleaseId: RELEASE,
    })
    expect(reactivatedRows.run?.status).toBe('active')
    expect(reactivatedRows.target?.updatedAt).toBe(22222)

    await t.mutation(
      internal.marketplace.seed.templates.endpoints.syncSeedTemplateItems,
      buildSeedItemsInput({
        runId: 'run-activation',
        itemsContentHash: 'items-activation-v2',
        items: [
          seedItem('mario', 0, {
            label: 'Super Mario',
            mediaDedupeHash: 'tile:hash-mario',
          }),
          seedItem('link', 1, {
            label: 'Link',
            mediaDedupeHash: 'tile:hash-link',
          }),
        ],
      })
    )
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedCriteria,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-activation',
        criteria: withCriteriaContentHash(
          [
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
              status: 'active' as const,
            },
          ],
          'criteria-activation-v2'
        ),
      }
    )
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
    await t.mutation(
      internal.marketplace.seed.templates.endpoints.upsertSeedTemplates,
      buildSeedTemplateInput({
        runId: 'run-activation',
        templates: [
          buildSeedTemplate({
            metadataContentHash: 'meta-activation-v2',
            category: 'movies',
            coverMediaDedupeHash: 'tile:hash-cover',
            itemCount: 2,
          }),
          buildSeedTemplate({
            externalId: 'gaming:new-active-template',
            metadataContentHash: 'meta-new-active-template',
            title: 'New active template',
            description: 'Added after activation.',
            tags: ['new'],
          }),
        ],
      })
    )
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

    const failedActiveVerify = await runChunkedSeedVerification(t, {
      datasetKey: DATASET,
      releaseId: RELEASE,
      runId: 'run-activation',
      templateExternalIds: ['gaming:ssbu-fighters'],
      expectedTotals: {
        templateCount: 1,
        itemCount: 99,
        criterionCount: 1,
        sourceImageCount: 3,
        variantCount: 6,
        estimatedUploadBytes: 0,
        estimatedStorageBytes: 0,
      },
    })
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
      t.mutation(
        internal.marketplace.seed.templates.endpoints.rollbackSeedRelease,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          runId: 'run-activation',
          targetReleaseId: buildingRelease,
          confirm: true,
        }
      )
    ).rejects.toThrow(/no restorable seed run/)

    const rolledBack = await t.mutation(
      internal.marketplace.seed.templates.endpoints.rollbackSeedRelease,
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

    enableSeedApi(SEED_SECRET)
    await expect(
      t.action(
        internal.marketplace.seed.templates.endpoints.finalizeSeedUploadedMedia,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          runId: 'run-finalize',
          authorEmail: AUTHOR_EMAIL,
          assets: [],
        }
      )
    ).rejects.toThrow(/assets must include 1..64 entries/)

    const first = await t.action(
      internal.marketplace.seed.templates.endpoints.finalizeSeedUploadedMedia,
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
      internal.marketplace.seed.templates.endpoints.finalizeSeedUploadedMedia,
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
      internal.marketplace.seed.templates.endpoints.finalizeSeedUploadedMedia,
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
      internal.marketplace.seed.templates.endpoints.finalizeSeedUploadedMedia,
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
      internal.marketplace.seed.lib.storageUploads
        .registerSeedUploadedStorageIds,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-finalize',
        storageIds: [abandonedStorageId],
      }
    )
    const cleanup = await t.action(
      internal.marketplace.seed.lib.storageUploads.cleanupAbandonedSeedRun,
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

  it('marks cleaned seed uploads even when finalize races after cleanup eligibility', async () =>
  {
    const t = makeTest()
    await seedRunRow(t, RELEASE, 'building', 'run-cleanup-race')
    const storageId = await storeImageBytes(t, buildPngHeader(32, 16))

    await t.mutation(
      internal.marketplace.seed.lib.storageUploads
        .registerSeedUploadedStorageIds,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-cleanup-race',
        storageIds: [storageId],
      }
    )
    const rowId = await t.run(async (ctx) =>
    {
      const row = await ctx.db
        .query('seedRunStorageUploads')
        .withIndex('byStorageId', (q) => q.eq('storageId', storageId))
        .unique()
      if (!row) throw new Error('seed upload row missing')
      return row._id
    })

    await t.mutation(
      internal.marketplace.seed.lib.storageUploads
        .markSeedUploadedStorageIdsResolved,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        runId: 'run-cleanup-race',
        storageIds: [storageId],
      }
    )
    await t.run(async (ctx) => await ctx.storage.delete(storageId))
    await t.mutation(
      internal.marketplace.seed.lib.storageUploads
        .markSeedUploadedStorageIdsCleaned,
      { rowIds: [rowId] }
    )

    const row = await t.run(async (ctx) => await ctx.db.get(rowId))
    expect(row?.status).toBe('cleaned')
  })
})
