// convex/workspace/boards/upsertBoardState.ts
// fat reconciling mutation — receives full board snapshot + revision cursor,
// diffs against existing rows, & returns new revision or conflict state

import { v } from 'convex/values'
import { mutation } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import type {
  CloudBoardState,
  CloudBoardItemWire as WireItem,
  CloudBoardTierWire as WireTier,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import { requireCurrentUserId } from '../../lib/auth'
import { tierColorSpecValidator } from '../../lib/validators'
import { diffTiers, diffItems } from '../sync/boardReconciler'
import {
  findOwnedActiveBoardByExternalId,
  findOwnedMediaAssetByExternalId,
} from '../../lib/permissions'

const MAX_TIERS = 50
const MAX_ITEMS = 2000
const MAX_LABEL_LEN = 200
const MAX_ALT_LEN = 500
const MAX_TIER_NAME_LEN = 100
const MAX_TIER_DESCRIPTION_LEN = 500
const MAX_BACKGROUND_COLOR_LEN = 32
// tombstones older than this are dropped from the server state payload so
// the client stops re-sending them in deletedItemIds. clients that held an
// older version offline will still try to delete them, which is a no-op on
// rows the server already purged. 30 days matches the soft-delete retention
// window in crons.ts so the two aren't out of sync
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// validators whose shapes match WireTier & WireItem from boardReconciler.
// v.string() has no .max() — runtime length guards enforced in the handler
const wireTierValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.optional(tierColorSpecValidator),
  itemIds: v.array(v.string()),
})

const wireItemValidator = v.object({
  externalId: v.string(),
  tierId: v.union(v.string(), v.null()),
  label: v.optional(v.string()),
  backgroundColor: v.optional(v.string()),
  altText: v.optional(v.string()),
  mediaExternalId: v.optional(v.union(v.string(), v.null())),
  order: v.number(),
  // optional — accepted & stored for future LWW conflict resolution. see
  // convex/workspace/sync/boardReconciler.ts for the known limitation
  clientUpdatedAt: v.optional(v.number()),
})

// canonical externalId prefix guards — server-side defense-in-depth atop the
// client id generators in convex/lib/ids.ts & src/shared/lib/id.ts
const validateBoardExternalId = (externalId: string): void =>
{
  if (!externalId.startsWith('board-'))
  {
    throw new Error('invalid boardExternalId: must start with "board-"')
  }
}

const validateTierExternalId = (externalId: string): void =>
{
  if (!externalId.startsWith('tier-'))
  {
    throw new Error('invalid tierExternalId: must start with "tier-"')
  }
}

// item externalIds are plain UUIDs in this codebase (not prefixed) — validate
// length only so a client can't smuggle in a multi-megabyte string
const validateItemExternalId = (externalId: string): void =>
{
  if (externalId.length < 1 || externalId.length > 128)
  {
    throw new Error('invalid itemExternalId: length must be 1..128')
  }
}

const validateMediaExternalId = (externalId: string): void =>
{
  if (!externalId.startsWith('media-'))
  {
    throw new Error('invalid mediaExternalId: must start with "media-"')
  }
}

type UpsertResult =
  | { conflict: null; newRevision: number }
  | { conflict: CloudBoardState; newRevision: null }

const loadServerState = async (
  ctx: MutationCtx,
  board: Doc<'boards'>,
  serverTiers: Doc<'boardTiers'>[],
  serverItems: Doc<'boardItems'>[]
): Promise<CloudBoardState> =>
{
  const mediaIds = new Set<Id<'mediaAssets'>>()
  for (const item of serverItems)
  {
    if (item.mediaAssetId) mediaIds.add(item.mediaAssetId)
  }

  // convex mutations are single-threaded, so Promise.all here buys nothing
  // over a sequential loop & throws on the first missing asset would let
  // an orphaned item poison the whole conflict payload. loop w/ a throw
  // so orphans surface loudly instead of being silently elided
  const mediaIdToExternalId = new Map<Id<'mediaAssets'>, string>()
  for (const id of mediaIds)
  {
    const asset = await ctx.db.get(id)
    if (!asset)
    {
      throw new Error(
        `dangling media reference in server state: ${id} (board ${board._id})`
      )
    }
    mediaIdToExternalId.set(id, asset.externalId)
  }

  const tierIdToExternalId = new Map<Id<'boardTiers'>, string>()
  for (const tier of serverTiers)
  {
    tierIdToExternalId.set(tier._id, tier.externalId)
  }

  const tierItemIds = new Map<string, string[]>()
  for (const tier of serverTiers)
  {
    tierItemIds.set(tier.externalId, [])
  }

  const sortedActiveItems = serverItems
    .filter((i) => i.deletedAt === null)
    .sort((a, b) => a.order - b.order)

  for (const item of sortedActiveItems)
  {
    if (!item.tierId) continue
    const tierExtId = tierIdToExternalId.get(item.tierId)
    if (tierExtId)
    {
      tierItemIds.get(tierExtId)?.push(item.externalId)
    }
  }

  // drop tombstones past TOMBSTONE_TTL_MS so the conflict payload stays
  // bounded & clients stop re-sending them in deletedItemIds
  const tombstoneCutoff = Date.now() - TOMBSTONE_TTL_MS
  const itemsForPayload = serverItems.filter(
    (item) => item.deletedAt === null || item.deletedAt >= tombstoneCutoff
  )

  return {
    title: board.title,
    revision: board.revision ?? 0,
    tiers: serverTiers
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        externalId: t.externalId,
        name: t.name,
        description: t.description,
        colorSpec: t.colorSpec,
        rowColorSpec: t.rowColorSpec,
        order: t.order,
        itemIds: tierItemIds.get(t.externalId) ?? [],
      })),
    items: itemsForPayload.map((item) => ({
      externalId: item.externalId,
      tierId: item.tierId
        ? (tierIdToExternalId.get(item.tierId) ?? null)
        : null,
      label: item.label,
      backgroundColor: item.backgroundColor,
      altText: item.altText,
      mediaExternalId: item.mediaAssetId
        ? mediaIdToExternalId.get(item.mediaAssetId)
        : undefined,
      order: item.order,
      deletedAt: item.deletedAt,
    })),
  }
}

export const upsertBoardState = mutation({
  args: {
    boardExternalId: v.string(),
    baseRevision: v.union(v.number(), v.null()),
    title: v.string(),
    tiers: v.array(wireTierValidator),
    items: v.array(wireItemValidator),
    deletedItemIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<UpsertResult> =>
  {
    const userId = await requireCurrentUserId(ctx)

    validateBoardExternalId(args.boardExternalId)

    if (args.tiers.length > MAX_TIERS)
    {
      throw new Error(
        `too many tiers: ${args.tiers.length} exceeds ${MAX_TIERS}`
      )
    }
    if (args.items.length > MAX_ITEMS)
    {
      throw new Error(
        `too many items: ${args.items.length} exceeds ${MAX_ITEMS}`
      )
    }

    // per-field bounds — prevents a client from smuggling oversized blobs
    // into the mutation (Convex has a 1MB per-string cap but an attacker
    // can still push ~999KB labels 2000 times). guards keep writes small
    for (const tier of args.tiers)
    {
      validateTierExternalId(tier.externalId)
      if (tier.name.length > MAX_TIER_NAME_LEN)
      {
        throw new Error(
          `tier name too long: ${tier.name.length} exceeds ${MAX_TIER_NAME_LEN}`
        )
      }
      if ((tier.description?.length ?? 0) > MAX_TIER_DESCRIPTION_LEN)
      {
        throw new Error(
          `tier description too long: exceeds ${MAX_TIER_DESCRIPTION_LEN}`
        )
      }
    }

    for (const item of args.items)
    {
      validateItemExternalId(item.externalId)
      if ((item.label?.length ?? 0) > MAX_LABEL_LEN)
      {
        throw new Error(`item label too long: exceeds ${MAX_LABEL_LEN} chars`)
      }
      if ((item.altText?.length ?? 0) > MAX_ALT_LEN)
      {
        throw new Error(`item altText too long: exceeds ${MAX_ALT_LEN} chars`)
      }
      if ((item.backgroundColor?.length ?? 0) > MAX_BACKGROUND_COLOR_LEN)
      {
        throw new Error(
          `item backgroundColor too long: exceeds ${MAX_BACKGROUND_COLOR_LEN} chars`
        )
      }
      if (item.mediaExternalId)
      {
        validateMediaExternalId(item.mediaExternalId)
      }
    }

    for (const deletedId of args.deletedItemIds)
    {
      validateItemExternalId(deletedId)
    }

    // normalize + cap the title consistently w/ createBoard & updateBoardMeta
    const normalizedTitle = normalizeBoardTitle(args.title)

    let board = await findOwnedActiveBoardByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )

    if (!board)
    {
      // defense-in-depth: the owner-scoped unique index already prevents
      // per-user collisions, but an attacker could try to claim another
      // user's boardExternalId. reject if the externalId is in use anywhere.
      const existingAny = await ctx.db
        .query('boards')
        .withIndex('byExternalId', (q) =>
          q.eq('externalId', args.boardExternalId)
        )
        .first()
      if (existingAny && existingAny.ownerId !== userId)
      {
        throw new Error('boardExternalId already in use')
      }

      const boardId = await ctx.db.insert('boards', {
        externalId: args.boardExternalId,
        ownerId: userId,
        title: normalizedTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        revision: 0,
      })
      board = (await ctx.db.get(boardId))!
    }

    if (board.deletedAt !== null)
    {
      throw new Error('cannot sync to a deleted board')
    }

    const serverTiers = await ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', board!._id))
      .take(MAX_TIERS * 2)

    const serverItems = await ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', board!._id))
      .take(MAX_ITEMS * 2)

    const currentRevision = board.revision ?? 0
    if (args.baseRevision !== null && args.baseRevision !== currentRevision)
    {
      const serverState = await loadServerState(
        ctx,
        board,
        serverTiers,
        serverItems
      )
      return { conflict: serverState, newRevision: null }
    }

    // the validator produces a structurally compatible type; Convex inferred
    // types use v.Infer<> which is the same shape as WireTier/WireItem
    const tierDiff = diffTiers(args.tiers as WireTier[], serverTiers)

    for (const tierId of tierDiff.remove)
    {
      await ctx.db.delete(tierId)
    }

    for (const { id, fields } of tierDiff.patch)
    {
      await ctx.db.patch(id, fields)
    }

    const newTierIds = new Map<string, Id<'boardTiers'>>()
    for (const tier of tierDiff.insert)
    {
      const id = await ctx.db.insert('boardTiers', {
        boardId: board._id,
        externalId: tier.externalId,
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order: tier.order,
      })
      newTierIds.set(tier.externalId, id)
    }

    const tierExternalIdToId = new Map<string, Id<'boardTiers'>>()
    for (const tier of serverTiers)
    {
      if (!tierDiff.remove.has(tier._id))
      {
        tierExternalIdToId.set(tier.externalId, tier._id)
      }
    }
    for (const [extId, id] of newTierIds)
    {
      tierExternalIdToId.set(extId, id)
    }

    const mediaExternalIds = new Set<string>()
    for (const item of args.items)
    {
      if (item.mediaExternalId)
      {
        mediaExternalIds.add(item.mediaExternalId)
      }
    }

    const mediaExternalIdToId = new Map<string, Id<'mediaAssets'>>()
    for (const extId of mediaExternalIds)
    {
      const asset = await findOwnedMediaAssetByExternalId(ctx, extId, userId)
      if (!asset)
      {
        // fail loudly — silently dropping references to unowned/missing
        // media was masking real bugs (orphaned items pointing at nothing)
        throw new Error(`media not found or not owned: ${extId}`)
      }
      mediaExternalIdToId.set(extId, asset._id)
    }

    const deletedItemExternalIds = new Set(args.deletedItemIds)
    const itemDiff = diffItems(
      args.items as WireItem[],
      serverItems,
      tierExternalIdToId,
      mediaExternalIdToId,
      deletedItemExternalIds
    )

    for (const { id, deletedAt } of itemDiff.softDelete)
    {
      await ctx.db.patch(id, { deletedAt })
    }

    for (const { id, fields } of itemDiff.patch)
    {
      await ctx.db.patch(id, fields)
    }

    for (const item of itemDiff.insert)
    {
      await ctx.db.insert('boardItems', {
        boardId: board._id,
        ...item,
      })
    }

    const newRevision = currentRevision + 1
    await ctx.db.patch(board._id, {
      title: normalizedTitle,
      updatedAt: Date.now(),
      revision: newRevision,
    })

    return { conflict: null, newRevision }
  },
})
