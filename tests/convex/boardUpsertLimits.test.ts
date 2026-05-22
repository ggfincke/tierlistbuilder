// tests/convex/boardUpsertLimits.test.ts
// Convex board upsert behavior at sync caps & validation boundaries

import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  MAX_CLOUD_BOARD_TIERS,
  MAX_LARGE_CLOUD_BOARD_ITEMS,
  MAX_STANDARD_CLOUD_BOARD_ITEMS,
  type CloudBoardPayload,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  IMAGE_PADDING_MAX,
  IMAGE_PADDING_MIN,
} from '@tierlistbuilder/contracts/workspace/board'
import schema from '../../convex/schema'
import { BOARD_ITEM_TAKE_LIMIT } from '../../convex/lib/limits'
import { modules, seedCloudBoard } from './convexTestHelpers'

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  plan: 'free' | 'plus' = 'free'
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name: 'Board User',
        displayName: 'Board User',
        email: 'board@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        plan,
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

const makeMediaExternalIds = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `media-${i}`)

const makeBoardPayload = (options: {
  tierCount: number
  itemCount: number
  deletedItemCount?: number
  mediaExternalIds?: readonly string[]
}): CloudBoardPayload =>
{
  const tiers = Array.from({ length: options.tierCount }, (_, i) => ({
    externalId: `tier-${i}`,
    name: `Tier ${i}`,
    colorSpec: { kind: 'palette' as const, index: i % 8 },
    itemIds: [] as string[],
  }))
  const deletedItemCount = options.deletedItemCount ?? 0
  const deletedStart = options.itemCount - deletedItemCount
  const items: CloudBoardPayload['items'] = []
  const deletedItemIds: string[] = []

  for (let i = 0; i < options.itemCount; i++)
  {
    const externalId = `item-${i}`
    const isDeleted = i >= deletedStart
    const tierIndex = options.tierCount > 0 ? i % options.tierCount : -1
    const tierId = isDeleted ? null : (tiers[tierIndex]?.externalId ?? null)

    if (tierId) tiers[tierIndex].itemIds.push(externalId)
    if (isDeleted) deletedItemIds.push(externalId)

    items.push({
      externalId,
      tierId,
      label: `Item ${i}`,
      mediaExternalId: options.mediaExternalIds?.[i] ?? null,
      order: isDeleted ? -1 : i,
    })
  }

  return { title: 'Limit Board', tiers, items, deletedItemIds }
}

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

const seedMediaAssets = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  userId: Id<'users'>,
  mediaExternalIds: readonly string[]
): Promise<void> =>
{
  await t.run(async (ctx) =>
  {
    await Promise.all(
      mediaExternalIds.map(async (externalId, i) =>
      {
        const now = Date.now()
        const storageId = await ctx.storage.store(new Blob(['image-bytes']))
        const mediaAssetId = await ctx.db.insert('mediaAssets', {
          ownerId: userId,
          externalId,
          dedupeHash: `hash-${i}`,
          tileVariant: {
            storageId,
            width: 100,
            height: 100,
            byteSize: 10,
            mimeType: 'image/png',
            contentHash: `hash-${i}`,
          },
          createdAt: now,
        })
        await ctx.db.insert('mediaVariants', {
          mediaAssetId,
          kind: 'tile',
          storageId,
          width: 100,
          height: 100,
          byteSize: 10,
          mimeType: 'image/png',
          contentHash: `hash-${i}`,
          createdAt: now,
        })
      })
    )
  })
}

describe('upsertBoardState', () =>
{
  it('does not bump the revision for omitted optional style fields', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })

    const created = await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-no-style-overrides',
        baseRevision: null,
        ...payload,
      }
    )
    expect(created).toEqual({ conflict: null, newRevision: 1 })

    const unchanged = await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-no-style-overrides',
        baseRevision: 1,
        ...payload,
      }
    )
    expect(unchanged).toEqual({ conflict: null, newRevision: 1 })
  })

  it('maintains library summary fields w/ ranked/unranked counts & cover items', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    await seedMediaAssets(t, userId, ['media-ranked'])
    const caller = asUser(t, userId)

    await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-library-summary',
        baseRevision: null,
        title: 'Library Board',
        tiers: [
          {
            externalId: 'tier-ranked',
            name: 'Ranked',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: ['item-ranked'],
          },
          {
            externalId: 'tier-empty',
            name: 'Empty',
            colorSpec: { kind: 'palette', index: 1 },
            itemIds: [],
          },
        ],
        items: [
          {
            externalId: 'item-ranked',
            tierId: 'tier-ranked',
            label: 'Ranked item',
            mediaExternalId: 'media-ranked',
            order: 0,
          },
          {
            externalId: 'item-unranked',
            tierId: null,
            label: 'Unranked item',
            mediaExternalId: null,
            order: 1,
          },
        ],
        deletedItemIds: [],
      }
    )

    const boards = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(boards[0]).toMatchObject({
      title: 'Library Board',
      activeItemCount: 2,
      unrankedItemCount: 1,
      rankedItemCount: 1,
      publishState: 'wip',
      syncState: 'synced',
      tierCount: 2,
    })
    expect(boards[0]).not.toHaveProperty('status')
  })

  it('rejects multi-board state pulls so each query stays within read budget', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)

    for (const boardExternalId of ['board-pull-a', 'board-pull-b'])
    {
      await caller.mutation(
        api.workspace.boards.upsertBoardState.upsertBoardState,
        {
          boardExternalId,
          baseRevision: null,
          ...makeBoardPayload({ tierCount: 1, itemCount: 1 }),
        }
      )
    }

    await expectConvexCode(
      caller.query(api.workspace.boards.queries.getBoardStatesByExternalIds, {
        boardExternalIds: ['board-pull-a', 'board-pull-b'],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )
  })

  it('enforces standard and large cloud item limits by plan', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const freeUserId = await seedUser(t)
    const plusUserId = await seedUser(t, 'plus')

    await expectConvexCode(
      asUser(t, freeUserId).mutation(
        api.workspace.boards.upsertBoardState.upsertBoardState,
        {
          boardExternalId: 'board-free-too-large',
          baseRevision: null,
          ...makeBoardPayload({
            tierCount: 1,
            itemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
          }),
        }
      ),
      CONVEX_ERROR_CODES.cloudItemLimitExceeded
    )

    const synced = await asUser(t, plusUserId).mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-plus-large',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: 1,
          itemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
        }),
      }
    )
    expect(synced).toEqual({ conflict: null, newRevision: 1 })

    const deletedOverflow = await asUser(t, freeUserId).mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-free-deleted-overflow',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: 1,
          itemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS + 1,
          deletedItemCount: 1,
        }),
      }
    )
    expect(deletedOverflow).toEqual({ conflict: null, newRevision: 1 })
  })

  it('accepts max-size Plus boards (incl. all-tombstone updates) within tx budget', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t, 'plus')
    const mediaIds = makeMediaExternalIds(MAX_LARGE_CLOUD_BOARD_ITEMS)
    await seedMediaAssets(t, userId, mediaIds)
    const caller = asUser(t, userId)

    const create = await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-tombstones',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: MAX_CLOUD_BOARD_TIERS,
          itemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
          mediaExternalIds: mediaIds,
        }),
      }
    )
    expect(create).toEqual({ conflict: null, newRevision: 1 })

    const tombstoned = await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-tombstones',
        baseRevision: 1,
        ...makeBoardPayload({
          tierCount: MAX_CLOUD_BOARD_TIERS,
          itemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
          deletedItemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
        }),
      }
    )
    expect(tombstoned).toEqual({ conflict: null, newRevision: 2 })

    const state = await caller.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: 'board-tombstones' }
    )
    expect(state?.items).toHaveLength(MAX_LARGE_CLOUD_BOARD_ITEMS)
    expect(state?.items.every((item) => item.deletedAt !== null)).toBe(true)
  }, 20_000)

  it('loads max-size boards even when recent tombstone churn exceeds the row window', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t, 'plus')
    const boardId = await t.run(
      async (ctx) =>
        await seedCloudBoard(ctx, {
          ownerId: userId,
          externalId: 'board-heavy-churn',
          title: 'Heavy Churn Board',
          activeItemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
          unrankedItemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
        })
    )
    const now = Date.now()
    const totalRows = BOARD_ITEM_TAKE_LIMIT + 5
    const chunkSize = 500
    for (let start = 0; start < totalRows; start += chunkSize)
    {
      const end = Math.min(start + chunkSize, totalRows)
      await t.run(async (ctx) =>
      {
        for (let i = start; i < end; i++)
        {
          const active = i < MAX_LARGE_CLOUD_BOARD_ITEMS
          await ctx.db.insert('boardItems', {
            boardId,
            tierId: null,
            externalId: active ? `active-${i}` : `deleted-${i}`,
            label: active ? `Active ${i}` : `Deleted ${i}`,
            mediaAssetId: null,
            order: active ? i : -1,
            deletedAt: active ? null : now - i,
          })
        }
      })
    }

    const state = await asUser(t, userId).query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: 'board-heavy-churn' }
    )
    expect(state?.items.filter((item) => item.deletedAt === null)).toHaveLength(
      MAX_LARGE_CLOUD_BOARD_ITEMS
    )
    expect(state?.items).toHaveLength(BOARD_ITEM_TAKE_LIMIT)
  }, 20_000)

  it('rejects payloads above tier/item caps & invalid label coordinates or font sizes', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const itemPayload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
    const boardPayload = makeBoardPayload({ tierCount: 1, itemCount: 0 })

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-too-many-tiers',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: MAX_CLOUD_BOARD_TIERS + 1,
          itemCount: 0,
        }),
      }),
      CONVEX_ERROR_CODES.syncLimitExceeded
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-item-label',
        baseRevision: null,
        ...itemPayload,
        items: [
          {
            ...itemPayload.items[0]!,
            labelOptions: {
              placement: { mode: 'overlay', x: Number.NaN, y: 0.5 },
            },
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-board-label-size',
        baseRevision: null,
        ...boardPayload,
        labels: { fontSizePx: 72 },
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-auto-plate-color',
        baseRevision: null,
        ...boardPayload,
        autoPlate: { mode: 'uniform', uniformColor: 'not-a-color' },
      }),
      CONVEX_ERROR_CODES.invalidInput
    )
  })

  it('rejects non-finite or out-of-range image padding before writing rows', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-item-padding-nan',
        baseRevision: null,
        ...payload,
        items: [
          {
            ...payload.items[0]!,
            imagePadding: Number.NaN,
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-item-padding-high',
        baseRevision: null,
        ...payload,
        items: [
          {
            ...payload.items[0]!,
            imagePadding: IMAGE_PADDING_MAX + 0.01,
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-default-padding-infinity',
        baseRevision: null,
        ...payload,
        defaultItemImagePadding: Number.POSITIVE_INFINITY,
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-default-padding-low',
        baseRevision: null,
        ...payload,
        defaultItemImagePadding: IMAGE_PADDING_MIN - 0.01,
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    const boards = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(boards).toEqual([])
  })

  it('rejects duplicate externalIds and invalid aspect ratios before writing rows', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const payload = makeBoardPayload({ tierCount: 2, itemCount: 2 })

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-duplicate-tiers',
        baseRevision: null,
        ...payload,
        tiers: [
          payload.tiers[0]!,
          {
            ...payload.tiers[1]!,
            externalId: payload.tiers[0]!.externalId,
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-duplicate-items',
        baseRevision: null,
        ...payload,
        items: [
          payload.items[0]!,
          {
            ...payload.items[1]!,
            externalId: payload.items[0]!.externalId,
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-item-aspect-ratio',
        baseRevision: null,
        ...payload,
        items: [{ ...payload.items[0]!, aspectRatio: Number.NaN }],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-board-aspect-ratio',
        baseRevision: null,
        ...payload,
        itemAspectRatio: Number.POSITIVE_INFINITY,
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    const boards = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(boards).toEqual([])
  })

  it('rejects oversized board text fields before writing rows', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-tier-name-too-long',
        baseRevision: null,
        ...payload,
        tiers: [
          {
            ...payload.tiers[0]!,
            name: 'x'.repeat(101),
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-notes-too-long',
        baseRevision: null,
        ...payload,
        items: [
          {
            ...payload.items[0]!,
            notes: 'x'.repeat(2001),
          },
        ],
      }),
      CONVEX_ERROR_CODES.invalidInput
    )

    const boards = await caller.query(
      api.workspace.boards.queries.getMyLibraryBoards,
      {}
    )
    expect(boards).toEqual([])
  })
})
