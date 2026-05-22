// tests/convex/mediaVariants.test.ts
// Convex media variant finalization, exact lookup, & reachability GC

import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import schema from '../../convex/schema'
import { buildFreshBoardCloudFields } from '../../convex/workspace/boards/cloudFields'
import {
  EMPTY_BOARD_SOURCE_RANKING,
  EMPTY_BOARD_SOURCE_TEMPLATE,
} from '../../convex/workspace/boards/sourceFields'
import {
  modules,
  seedCloudBoard,
  seedPublishedTemplate,
} from './convexTestHelpers'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
  convexTest({ schema, modules, transactionLimits: true })

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  name = 'Media User'
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name,
        displayName: name,
        email: 'media@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plan: 'free',
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

const expectConvexCode = async (
  promise: Promise<unknown>,
  code: string
): Promise<void> =>
{
  await expect(promise).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof ConvexError &&
      typeof error.data === 'object' &&
      error.data !== null &&
      'code' in error.data &&
      error.data.code === code
  )
}

const storeImageBlob = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  bytes: number[]
): Promise<Id<'_storage'>> =>
  await t.run(
    async (ctx) =>
      await ctx.storage.store(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      )
  )

const finalizeTileAsset = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  userId: Id<'users'>,
  contentHash: string,
  bytes: number[]
): Promise<{ mediaAssetId: Id<'mediaAssets'>; externalId: string }> =>
{
  const storageId = await storeImageBlob(t, bytes)
  return await t.mutation(
    internal.platform.media.internal.finalizeVerifiedMediaAsset,
    {
      userId,
      variants: [
        {
          kind: 'tile',
          storageId,
          contentHash,
          mimeType: 'image/png',
          width: 120,
          height: 90,
          byteSize: bytes.length,
        },
      ],
    }
  )
}

describe('media variants', () =>
{
  it('reports only media ids reusable by the caller or existing board rows', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const otherUserId = await seedUser(t, 'Other Media User')
    const owned = await finalizeTileAsset(t, userId, 'owned-hash', [1, 2, 3])
    const other = await finalizeTileAsset(
      t,
      otherUserId,
      'other-hash',
      [4, 5, 6]
    )

    const withoutBoard = await asUser(t, userId).query(
      api.platform.media.queries.getReusableMediaExternalIds,
      {
        externalIds: [owned.externalId, other.externalId, 'media-missing'],
        boardExternalId: null,
      }
    )
    expect(withoutBoard).toEqual([true, false, false])

    await t.run(async (ctx) =>
    {
      const boardId = await seedCloudBoard(ctx, {
        ownerId: userId,
        externalId: 'board-a',
        title: 'Board A',
      })
      await ctx.db.insert('boardItems', {
        boardId,
        tierId: null,
        externalId: 'item-a',
        mediaAssetId: other.mediaAssetId,
        order: 0,
        deletedAt: null,
      })
    })

    const withBoard = await asUser(t, userId).query(
      api.platform.media.queries.getReusableMediaExternalIds,
      {
        externalIds: [other.externalId],
        boardExternalId: 'board-a',
      }
    )
    expect(withBoard).toEqual([true])
  })

  it('does not expose media referenced only by pending or failed templates', async () =>
  {
    const t = makeTest()
    const ownerId = await seedUser(t)
    const viewerId = await seedUser(t, 'Viewer')
    const asset = await finalizeTileAsset(
      t,
      ownerId,
      'pending-template-media',
      [1, 2, 3]
    )
    const templateId = await t.run(async (ctx) =>
    {
      const id = await seedPublishedTemplate(ctx, {
        slug: 'MediaTpl1',
        authorId: ownerId,
        title: 'Media Template',
        sourceBoardId: null,
        sizeClass: 'standard',
        itemCount: 1,
      })
      await ctx.db.insert('templateItems', {
        templateId: id,
        externalId: 'media-template-item',
        label: 'Media Template Item',
        backgroundColor: null,
        altText: null,
        mediaAssetId: asset.mediaAssetId,
        order: 0,
        aspectRatio: null,
        imageFit: null,
        transform: null,
        imagePadding: null,
      })
      await ctx.db.patch(id, {
        publicationState: 'publishPending',
        isPubliclyListable: false,
      })
      return id
    })

    const queryMedia = async () =>
      await asUser(t, viewerId).query(
        api.platform.media.queries.getMediaAssetsByExternalIds,
        {
          media: [{ externalId: asset.externalId, variant: 'tile' }],
        }
      )

    await expect(queryMedia()).resolves.toEqual([null])
    await t.run(
      async (ctx) =>
        await ctx.db.patch(templateId, { publicationState: 'publishFailed' })
    )
    await expect(queryMedia()).resolves.toEqual([null])

    await t.run(
      async (ctx) =>
        await ctx.db.patch(templateId, { publicationState: 'published' })
    )
    const published = await queryMedia()
    expect(published[0]).toMatchObject({
      externalId: asset.externalId,
      mimeType: 'image/png',
    })
  })

  it('keeps registered seed upload blobs out of orphan storage GC', async () =>
  {
    const t = makeTest()
    vi.useFakeTimers()
    try
    {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const storageId = await storeImageBlob(t, [9, 9, 9])
      await t.run(async (ctx) =>
      {
        await ctx.db.insert('seedRunStorageUploads', {
          datasetKey: 'media-test',
          releaseId: 'release-1',
          runId: 'run-1',
          storageId,
          status: 'uploaded',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      vi.setSystemTime(new Date('2026-01-01T02:00:00.000Z'))
      await t.mutation(internal.platform.media.internal.gcOrphanedStorage, {
        cursor: null,
      })

      const stillExists = await t.run(
        async (ctx) => (await ctx.storage.get(storageId)) !== null
      )
      expect(stillExists).toBe(true)
    }
    finally
    {
      vi.useRealTimers()
    }
  })

  it('dedupes exact variant sets without merging different editor assets', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const tileStorageId = await storeImageBlob(t, [1, 2, 3])
    const editorStorageId = await storeImageBlob(t, [7, 8, 9])

    const first = await t.mutation(
      internal.platform.media.internal.finalizeVerifiedMediaAsset,
      {
        userId,
        variants: [
          {
            kind: 'tile',
            storageId: tileStorageId,
            contentHash: 'tile-hash',
            mimeType: 'image/png',
            width: 120,
            height: 90,
            byteSize: 3,
          },
          {
            kind: 'editor',
            storageId: editorStorageId,
            contentHash: 'editor-hash-a',
            mimeType: 'image/png',
            width: 1024,
            height: 768,
            byteSize: 3,
          },
        ],
      }
    )

    const beforePreview = await asUser(t, userId).query(
      api.platform.media.queries.getMediaAssetsByExternalIds,
      {
        media: [
          { externalId: first.externalId, variant: 'tile' },
          { externalId: first.externalId, variant: 'preview' },
        ],
      }
    )
    expect(beforePreview[0]).toMatchObject({
      externalId: first.externalId,
      mimeType: 'image/png',
    })
    expect(beforePreview[1]).toBeNull()

    const duplicateTileStorageId = await storeImageBlob(t, [4, 5, 6])
    const duplicateEditorStorageId = await storeImageBlob(t, [10, 11, 12])
    const second = await t.mutation(
      internal.platform.media.internal.finalizeVerifiedMediaAsset,
      {
        userId,
        variants: [
          {
            kind: 'tile',
            storageId: duplicateTileStorageId,
            contentHash: 'tile-hash',
            mimeType: 'image/png',
            width: 120,
            height: 90,
            byteSize: 3,
          },
          {
            kind: 'editor',
            storageId: duplicateEditorStorageId,
            contentHash: 'editor-hash-a',
            mimeType: 'image/png',
            width: 1024,
            height: 768,
            byteSize: 3,
          },
        ],
      }
    )
    expect(second.externalId).toBe(first.externalId)

    const sameTileStorageId = await storeImageBlob(t, [13, 14, 15])
    const differentEditorStorageId = await storeImageBlob(t, [16, 17, 18])
    const differentEditor = await t.mutation(
      internal.platform.media.internal.finalizeVerifiedMediaAsset,
      {
        userId,
        variants: [
          {
            kind: 'tile',
            storageId: sameTileStorageId,
            contentHash: 'tile-hash',
            mimeType: 'image/png',
            width: 120,
            height: 90,
            byteSize: 3,
          },
          {
            kind: 'editor',
            storageId: differentEditorStorageId,
            contentHash: 'editor-hash-b',
            mimeType: 'image/png',
            width: 1024,
            height: 768,
            byteSize: 3,
          },
        ],
      }
    )
    expect(differentEditor.externalId).not.toBe(first.externalId)

    const rows = await t.run(async (ctx) =>
    {
      const asset = await ctx.db.get(first.mediaAssetId)
      const otherAsset = await ctx.db.get(differentEditor.mediaAssetId)
      const variants = await ctx.db
        .query('mediaVariants')
        .withIndex('byMediaAssetAndKind', (q) =>
          q.eq('mediaAssetId', first.mediaAssetId)
        )
        .collect()
      return { asset, otherAsset, variants }
    })
    expect(rows.asset?.tileVariant.contentHash).toBe('tile-hash')
    expect(rows.asset?.editorVariant?.contentHash).toBe('editor-hash-a')
    expect(rows.otherAsset?.editorVariant?.contentHash).toBe('editor-hash-b')
    expect(rows.variants.map((row) => row.kind).sort()).toEqual([
      'editor',
      'tile',
    ])

    const afterEditor = await asUser(t, userId).query(
      api.platform.media.queries.getMediaAssetsByExternalIds,
      {
        media: [{ externalId: first.externalId, variant: 'editor' }],
      }
    )
    expect(afterEditor[0]).toMatchObject({
      externalId: first.externalId,
      mimeType: 'image/png',
    })
  })

  it('rejects invalid variant batches before upload blobs are decoded', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const storageIds = await Promise.all([
      storeImageBlob(t, [1]),
      storeImageBlob(t, [2]),
      storeImageBlob(t, [3]),
      storeImageBlob(t, [4]),
    ])

    await expectConvexCode(
      asUser(t, userId).action(
        api.platform.media.uploads.finalizeUploadVariants,
        {
          variants: storageIds.map((storageId, i) => ({
            kind: i === 0 ? 'tile' : i === 1 ? 'preview' : 'editor',
            storageId,
            uploadToken: 'not-a-real-token',
          })),
        }
      ),
      CONVEX_ERROR_CODES.invalidInput
    )

    const rowCounts = await t.run(async (ctx) => ({
      mediaAssets: (await ctx.db.query('mediaAssets').take(1)).length,
      mediaVariants: (await ctx.db.query('mediaVariants').take(1)).length,
    }))
    expect(rowCounts).toEqual({ mediaAssets: 0, mediaVariants: 0 })
  })

  it('keeps shared item media while any live board/template reference remains', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const storageId = await storeImageBlob(t, [1])

    const ids = await t.run(async (ctx) =>
    {
      const mediaAssetId = await ctx.db.insert('mediaAssets', {
        ownerId: userId,
        externalId: 'media-shared',
        dedupeHash: 'tile-shared',
        tileVariant: {
          storageId,
          width: 120,
          height: 120,
          byteSize: 1,
          mimeType: 'image/png',
          contentHash: 'tile-shared',
        },
        createdAt: 0,
      })
      await ctx.db.insert('mediaVariants', {
        mediaAssetId,
        kind: 'tile',
        storageId,
        width: 120,
        height: 120,
        byteSize: 1,
        mimeType: 'image/png',
        contentHash: 'tile-shared',
        createdAt: 0,
      })
      const boardId = await ctx.db.insert('boards', {
        externalId: 'board-shared',
        ownerId: userId,
        title: 'Shared Board',
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        revision: 1,
        itemAspectRatio: null,
        itemAspectRatioMode: null,
        aspectRatioPromptDismissed: false,
        defaultItemImageFit: null,
        sourceTemplate: EMPTY_BOARD_SOURCE_TEMPLATE,
        sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
        forkCounted: false,
        preferredCriterionExternalId: null,
        ...buildFreshBoardCloudFields(0),
        activeItemCount: 1,
        unrankedItemCount: 1,
        templateProgressState: 'none',
        librarySummary: {
          coverItems: [],
          tierCount: 0,
          tierColors: [],
          tierBreakdown: [],
        },
        paletteId: null,
        textStyleId: null,
        pageBackground: null,
        labels: null,
        seedDatasetKey: null,
        seedReleaseId: null,
        seedExternalId: null,
        seedContentHash: null,
        seedKind: null,
        seedReleaseStatus: null,
      })
      const boardItemId = await ctx.db.insert('boardItems', {
        boardId,
        tierId: null,
        externalId: 'item-shared',
        label: 'Shared',
        mediaAssetId,
        order: 0,
        deletedAt: null,
      })
      const templateId = await seedPublishedTemplate(ctx, {
        slug: 'Shared001',
        authorId: userId,
        title: 'Shared Template',
        sourceBoardId: boardId,
        sizeClass: 'standard',
        itemCount: 1,
        now: 0,
      })
      await ctx.db.insert('templateItems', {
        templateId,
        externalId: 'item-shared',
        label: 'Shared',
        backgroundColor: null,
        altText: null,
        mediaAssetId,
        order: 0,
        aspectRatio: null,
        imageFit: null,
        transform: null,
        imagePadding: null,
      })
      return { mediaAssetId, boardItemId, templateId }
    })

    await t.mutation(
      internal.marketplace.templates.internal.cascadeDeleteTemplate,
      { templateId: ids.templateId }
    )
    await t.mutation(internal.platform.media.internal.gcOrphanedMediaAssets, {
      cursor: null,
    })
    const stillReferenced = await t.run(async (ctx) => ({
      asset: await ctx.db.get(ids.mediaAssetId),
      variants: await ctx.db
        .query('mediaVariants')
        .withIndex('byMediaAssetAndKind', (q) =>
          q.eq('mediaAssetId', ids.mediaAssetId)
        )
        .collect(),
    }))
    expect(stillReferenced.asset).not.toBeNull()
    expect(stillReferenced.variants).toHaveLength(1)

    await t.run(async (ctx) =>
    {
      await ctx.db.delete(ids.boardItemId)
    })
    await t.mutation(internal.platform.media.internal.gcOrphanedMediaAssets, {
      cursor: null,
    })
    const reaped = await t.run(async (ctx) => ({
      asset: await ctx.db.get(ids.mediaAssetId),
      variants: await ctx.db
        .query('mediaVariants')
        .withIndex('byMediaAssetAndKind', (q) =>
          q.eq('mediaAssetId', ids.mediaAssetId)
        )
        .collect(),
      storage: await ctx.storage.get(storageId),
    }))
    expect(reaped.asset).toBeNull()
    expect(reaped.variants).toHaveLength(0)
    expect(reaped.storage).toBeNull()
  })
})
