// tests/convex/boardUpsertLimits.test.ts
// Convex board upsert behavior near configured sync limits

import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  MAX_CLOUD_BOARD_ITEMS,
  MAX_CLOUD_BOARD_TIERS,
  type CloudBoardPayload,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import schema from '../../convex/schema'
import { modules } from './convexTestHelpers'

const seedUser = async (
  t: ReturnType<typeof convexTest<typeof schema>>
): Promise<Id<'users'>> =>
  await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name: 'Board User',
        displayName: 'Board User',
        email: 'board@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tier: 'free',
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

    if (tierId)
    {
      tiers[tierIndex].itemIds.push(externalId)
    }
    if (isDeleted)
    {
      deletedItemIds.push(externalId)
    }

    items.push({
      externalId,
      tierId,
      label: `Item ${i}`,
      mediaExternalId: options.mediaExternalIds?.[i] ?? null,
      order: isDeleted ? -1 : i,
    })
  }

  return {
    title: 'Limit Board',
    tiers,
    items,
    deletedItemIds,
  }
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
    const storageId = await ctx.storage.store(new Blob(['image-bytes']))

    await Promise.all(
      mediaExternalIds.map((externalId, i) =>
        ctx.db.insert('mediaAssets', {
          ownerId: userId,
          externalId,
          storageId,
          contentHash: `hash-${i}`,
          mimeType: 'image/png',
          width: 100,
          height: 100,
          byteSize: 10,
          createdAt: Date.now(),
        })
      )
    )
  })
}

describe('upsertBoardState Convex limits', () =>
{
  it('accepts a max-size board where every item references owned media', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const mediaExternalIds = makeMediaExternalIds(MAX_CLOUD_BOARD_ITEMS)
    await seedMediaAssets(t, userId, mediaExternalIds)

    const result = await asUser(t, userId).mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-max-media',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: MAX_CLOUD_BOARD_TIERS,
          itemCount: MAX_CLOUD_BOARD_ITEMS,
          mediaExternalIds,
        }),
      }
    )

    expect(result).toEqual({ conflict: null, newRevision: 1 })

    const state = await asUser(t, userId).query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: 'board-max-media' }
    )

    expect(state?.tiers).toHaveLength(MAX_CLOUD_BOARD_TIERS)
    expect(state?.items).toHaveLength(MAX_CLOUD_BOARD_ITEMS)
    expect(state?.items[0]).toMatchObject({
      mediaExternalId: 'media-0',
      mediaContentHash: 'hash-0',
    })
  })

  it('rejects payloads above the tier or item sync caps', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)

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
        boardExternalId: 'board-too-many-items',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: 1,
          itemCount: MAX_CLOUD_BOARD_ITEMS + 1,
        }),
      }),
      CONVEX_ERROR_CODES.syncLimitExceeded
    )
  })

  it('rejects invalid label overlay coordinates', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const itemPayload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
    const boardPayload = makeBoardPayload({ tierCount: 1, itemCount: 0 })

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
        boardExternalId: 'board-bad-board-label',
        baseRevision: null,
        ...boardPayload,
        labels: {
          placement: { mode: 'overlay', x: 0.5, y: 1.2 },
        },
      }),
      CONVEX_ERROR_CODES.invalidInput
    )
  })

  it('syncs board label font size as a revisioned style change', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const payload = makeBoardPayload({ tierCount: 1, itemCount: 0 })

    await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-label-font-size',
        baseRevision: null,
        ...payload,
      }
    )

    const result = await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-label-font-size',
        baseRevision: 1,
        ...payload,
        labels: { fontSizePx: 18 },
      }
    )

    expect(result).toEqual({ conflict: null, newRevision: 2 })

    const state = await caller.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: 'board-label-font-size' }
    )

    expect(state?.labels).toEqual({ fontSizePx: 18 })
  })

  it('rejects invalid label font sizes', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const itemPayload = makeBoardPayload({ tierCount: 1, itemCount: 1 })
    const boardPayload = makeBoardPayload({ tierCount: 1, itemCount: 0 })

    await expectConvexCode(
      caller.mutation(api.workspace.boards.upsertBoardState.upsertBoardState, {
        boardExternalId: 'board-bad-item-label-size',
        baseRevision: null,
        ...itemPayload,
        items: [
          {
            ...itemPayload.items[0]!,
            labelOptions: { fontSizePx: Number.NaN },
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
  })

  it('handles a max-size tombstone update within the transaction budget', async () =>
  {
    const t = convexTest({ schema, modules, transactionLimits: true })
    const userId = await seedUser(t)
    const caller = asUser(t, userId)

    await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-tombstones',
        baseRevision: null,
        ...makeBoardPayload({
          tierCount: MAX_CLOUD_BOARD_TIERS,
          itemCount: MAX_CLOUD_BOARD_ITEMS,
        }),
      }
    )

    const result = await caller.mutation(
      api.workspace.boards.upsertBoardState.upsertBoardState,
      {
        boardExternalId: 'board-tombstones',
        baseRevision: 1,
        ...makeBoardPayload({
          tierCount: MAX_CLOUD_BOARD_TIERS,
          itemCount: MAX_CLOUD_BOARD_ITEMS,
          deletedItemCount: MAX_CLOUD_BOARD_ITEMS,
        }),
      }
    )

    expect(result).toEqual({ conflict: null, newRevision: 2 })

    const state = await caller.query(
      api.workspace.boards.queries.getBoardStateByExternalId,
      { boardExternalId: 'board-tombstones' }
    )

    expect(state?.items).toHaveLength(MAX_CLOUD_BOARD_ITEMS)
    expect(state?.items.every((item) => item.deletedAt !== null)).toBe(true)
  })
})
