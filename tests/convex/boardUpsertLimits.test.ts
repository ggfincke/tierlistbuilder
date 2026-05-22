// tests/convex/boardUpsertLimits.test.ts
// Convex board upsert behavior at sync caps & validation boundaries

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
import { BOARD_ITEM_TAKE_LIMIT } from '../../convex/lib/limits'
import {
  asUser,
  type ConvexTestHandle,
  expectConvexCode,
  makeTest,
  seedCloudBoard,
  seedTileMediaAsset,
  seedUser,
} from './convexTestHelpers'

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

const seedMediaAssets = async (
  t: ConvexTestHandle,
  userId: Id<'users'>,
  mediaExternalIds: readonly string[]
): Promise<void> =>
{
  await t.run(async (ctx) =>
  {
    await Promise.all(
      mediaExternalIds.map(async (externalId, i) =>
        await seedTileMediaAsset(ctx, {
          ownerId: userId,
          externalId,
          dedupeHash: `hash-${i}`,
          contentHash: `hash-${i}`,
          blob: new Blob(['image-bytes']),
          width: 100,
          height: 100,
          byteSize: 10,
        })
      )
    )
  })
}

const setupCaller = async (): Promise<ReturnType<typeof asUser>> =>
{
  const t = makeTest()
  const userId = await seedUser(t)
  return asUser(t, userId)
}

const expectUpsertRejected = async (
  caller: ReturnType<typeof asUser>,
  boardExternalId: string,
  payload: CloudBoardPayload,
  code = CONVEX_ERROR_CODES.invalidInput
): Promise<void> =>
{
  await expectConvexCode(
    caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
      boardExternalId,
      baseRevision: null,
      ...payload,
    }),
    code
  )
}

const expectNoLibraryBoards = async (
  caller: ReturnType<typeof asUser>
): Promise<void> =>
{
  const boards = await caller.query(
    api.workspace.boards.queries.getMyLibraryBoards,
    {}
  )
  expect(boards).toEqual([])
}

describe('upsertBoardState', () =>
{
  it('does not bump the revision for omitted optional style fields', async () =>
  {
    const t = makeTest()
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
    const t = makeTest()
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
    const t = makeTest()
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
    const t = makeTest()
    const freeUserId = await seedUser(t)
    const plusUserId = await seedUser(t, undefined, { plan: 'plus' })

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
    const t = makeTest()
    const userId = await seedUser(t, undefined, { plan: 'plus' })
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
    const t = makeTest()
    const userId = await seedUser(t, undefined, { plan: 'plus' })
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

  describe('validation rejections', () =>
  {
    it.each([
      [
        'payload above tier cap',
        'board-too-many-tiers',
        () =>
          makeBoardPayload({
            tierCount: MAX_CLOUD_BOARD_TIERS + 1,
            itemCount: 0,
          }),
        CONVEX_ERROR_CODES.syncLimitExceeded,
      ],
      [
        'item label overlay coordinate is non-finite',
        'board-bad-item-label',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
          return {
            ...payload,
            items: [
              {
                ...payload.items[0]!,
                labelOptions: {
                  placement: { mode: 'overlay', x: Number.NaN, y: 0.5 },
                },
              },
            ],
          }
        },
        CONVEX_ERROR_CODES.invalidInput,
      ],
      [
        'board label font size is out of range',
        'board-bad-board-label-size',
        () => ({
          ...makeBoardPayload({ tierCount: 1, itemCount: 0 }),
          labels: { fontSizePx: 72 },
        }),
        CONVEX_ERROR_CODES.invalidInput,
      ],
      [
        'auto plate color is invalid',
        'board-bad-auto-plate-color',
        () => ({
          ...makeBoardPayload({ tierCount: 1, itemCount: 0 }),
          autoPlate: { mode: 'uniform', uniformColor: 'not-a-color' },
        }),
        CONVEX_ERROR_CODES.invalidInput,
      ],
    ])('rejects %s', async (_, boardExternalId, buildPayload, code) =>
    {
      const caller = await setupCaller()
      await expectUpsertRejected(caller, boardExternalId, buildPayload(), code)
    })

    it.each([
      [
        'non-finite item image padding',
        'board-bad-item-padding-nan',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
          return {
            ...payload,
            items: [{ ...payload.items[0]!, imagePadding: Number.NaN }],
          }
        },
      ],
      [
        'item image padding above maximum',
        'board-bad-item-padding-high',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
          return {
            ...payload,
            items: [
              {
                ...payload.items[0]!,
                imagePadding: IMAGE_PADDING_MAX + 0.01,
              },
            ],
          }
        },
      ],
      [
        'non-finite default image padding',
        'board-bad-default-padding-infinity',
        () => ({
          ...makeBoardPayload({ tierCount: 1, itemCount: 1 }),
          defaultItemImagePadding: Number.POSITIVE_INFINITY,
        }),
      ],
      [
        'default image padding below minimum',
        'board-bad-default-padding-low',
        () => ({
          ...makeBoardPayload({ tierCount: 1, itemCount: 1 }),
          defaultItemImagePadding: IMAGE_PADDING_MIN - 0.01,
        }),
      ],
    ])('rejects %s before writing rows', async (_, boardExternalId, buildPayload) =>
    {
      const caller = await setupCaller()
      await expectUpsertRejected(caller, boardExternalId, buildPayload())
      await expectNoLibraryBoards(caller)
    })

    it.each([
      [
        'duplicate tier external ids',
        'board-duplicate-tiers',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 2, itemCount: 2 })
          return {
            ...payload,
            tiers: [
              payload.tiers[0]!,
              {
                ...payload.tiers[1]!,
                externalId: payload.tiers[0]!.externalId,
              },
            ],
          }
        },
      ],
      [
        'duplicate item external ids',
        'board-duplicate-items',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 2, itemCount: 2 })
          return {
            ...payload,
            items: [
              payload.items[0]!,
              {
                ...payload.items[1]!,
                externalId: payload.items[0]!.externalId,
              },
            ],
          }
        },
      ],
      [
        'non-finite item aspect ratio',
        'board-bad-item-aspect-ratio',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 2, itemCount: 2 })
          return {
            ...payload,
            items: [{ ...payload.items[0]!, aspectRatio: Number.NaN }],
          }
        },
      ],
      [
        'non-finite board aspect ratio',
        'board-bad-board-aspect-ratio',
        () => ({
          ...makeBoardPayload({ tierCount: 2, itemCount: 2 }),
          itemAspectRatio: Number.POSITIVE_INFINITY,
        }),
      ],
    ])('rejects %s before writing rows', async (_, boardExternalId, buildPayload) =>
    {
      const caller = await setupCaller()
      await expectUpsertRejected(caller, boardExternalId, buildPayload())
      await expectNoLibraryBoards(caller)
    })

    it.each([
      [
        'tier name above maximum length',
        'board-tier-name-too-long',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
          return {
            ...payload,
            tiers: [
              {
                ...payload.tiers[0]!,
                name: 'x'.repeat(101),
              },
            ],
          }
        },
      ],
      [
        'item notes above maximum length',
        'board-notes-too-long',
        () =>
        {
          const payload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
          return {
            ...payload,
            items: [
              {
                ...payload.items[0]!,
                notes: 'x'.repeat(2001),
              },
            ],
          }
        },
      ],
    ])('rejects %s before writing rows', async (_, boardExternalId, buildPayload) =>
    {
      const caller = await setupCaller()
      await expectUpsertRejected(caller, boardExternalId, buildPayload())
      await expectNoLibraryBoards(caller)
    })
  })
})
