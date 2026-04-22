// convex/workspace/boards/upsertBoardState.ts
// reconciling mutation split into validate / ensureBoard / apply phases —
// revision check now precedes row load so conflicts return early w/o scanning

import { ConvexError, v, type Infer } from 'convex/values'
import { mutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import { validateHexColor } from '../../lib/hexColor'
import { tierColorSpecValidator } from '../../lib/validators'
import { diffTiers, diffItems } from '../sync/boardReconciler'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'
import { MAX_SYNC_ITEMS, MAX_SYNC_TIERS } from '../../lib/limits'
import {
  findOwnedBoardByExternalIdIncludingDeleted,
  findOwnedMediaAssetByExternalId,
} from '../../lib/permissions'

const MAX_LABEL_LEN = 200
const MAX_ALT_LEN = 500
const MAX_TIER_NAME_LEN = 100
const MAX_TIER_DESCRIPTION_LEN = 500
const MAX_BACKGROUND_COLOR_LEN = 32

// validator shapes mirror CloudBoard{Tier,Item}Wire contracts; runtime length
// guards live in validateInputs since v.string() has no .max()
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
  aspectRatio: v.optional(v.number()),
  imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
})

// board-level aspect-ratio args — validators match CloudBoardAspectRatioFields
const boardAspectRatioValidators = {
  itemAspectRatio: v.optional(v.number()),
  itemAspectRatioMode: v.optional(
    v.union(v.literal('auto'), v.literal('manual'))
  ),
  aspectRatioPromptDismissed: v.optional(v.boolean()),
  defaultItemImageFit: v.optional(
    v.union(v.literal('cover'), v.literal('contain'))
  ),
}

interface UpsertArgs
{
  boardExternalId: string
  baseRevision: number | null
  title: string
  tiers: Infer<typeof wireTierValidator>[]
  items: Infer<typeof wireItemValidator>[]
  deletedItemIds: string[]
  itemAspectRatio?: number
  itemAspectRatioMode?: 'auto' | 'manual'
  aspectRatioPromptDismissed?: boolean
  defaultItemImageFit?: 'cover' | 'contain'
}

type UpsertResult =
  | { conflict: null; newRevision: number }
  | { conflict: { serverRevision: number }; newRevision: null }

// --- phase 1: validate inputs ------------------------------------------------

const failInput = (message: string): never =>
{
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidInput,
    message,
  })
}

const validateInputs = (args: UpsertArgs): void =>
{
  if (!args.boardExternalId.startsWith('board-'))
  {
    failInput('invalid boardExternalId: must start with "board-"')
  }

  if (args.tiers.length > MAX_SYNC_TIERS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `too many tiers: ${args.tiers.length} exceeds ${MAX_SYNC_TIERS}`,
    })
  }
  if (args.items.length > MAX_SYNC_ITEMS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `too many items: ${args.items.length} exceeds ${MAX_SYNC_ITEMS}`,
    })
  }

  // per-field bounds — prevents a client from smuggling oversized blobs
  // (Convex caps strings at 1MB but a run of ~999KB labels still adds up)
  for (const tier of args.tiers)
  {
    if (!tier.externalId.startsWith('tier-'))
    {
      failInput('invalid tierExternalId: must start with "tier-"')
    }
    if (tier.name.length > MAX_TIER_NAME_LEN)
    {
      failInput(
        `tier name too long: ${tier.name.length} exceeds ${MAX_TIER_NAME_LEN}`
      )
    }
    if ((tier.description?.length ?? 0) > MAX_TIER_DESCRIPTION_LEN)
    {
      failInput(
        `tier description too long: exceeds ${MAX_TIER_DESCRIPTION_LEN}`
      )
    }
    if (tier.colorSpec.kind === 'custom')
    {
      validateHexColor(tier.colorSpec.hex, 'tier.colorSpec.hex')
    }
    if (tier.rowColorSpec?.kind === 'custom')
    {
      validateHexColor(tier.rowColorSpec.hex, 'tier.rowColorSpec.hex')
    }
  }

  for (const item of args.items)
  {
    if (item.externalId.length < 1 || item.externalId.length > 128)
    {
      failInput('invalid itemExternalId: length must be 1..128')
    }
    if ((item.label?.length ?? 0) > MAX_LABEL_LEN)
    {
      failInput(`item label too long: exceeds ${MAX_LABEL_LEN} chars`)
    }
    if ((item.altText?.length ?? 0) > MAX_ALT_LEN)
    {
      failInput(`item altText too long: exceeds ${MAX_ALT_LEN} chars`)
    }
    if ((item.backgroundColor?.length ?? 0) > MAX_BACKGROUND_COLOR_LEN)
    {
      failInput(
        `item backgroundColor too long: exceeds ${MAX_BACKGROUND_COLOR_LEN} chars`
      )
    }
    if (item.backgroundColor)
    {
      validateHexColor(item.backgroundColor, 'item.backgroundColor')
    }
    if (item.mediaExternalId && !item.mediaExternalId.startsWith('media-'))
    {
      failInput('invalid mediaExternalId: must start with "media-"')
    }
  }

  for (const deletedId of args.deletedItemIds)
  {
    if (deletedId.length < 1 || deletedId.length > 128)
    {
      failInput('invalid itemExternalId: length must be 1..128')
    }
  }
}

// --- phase 2: ensure board + early revision check ----------------------------

const ensureBoard = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  boardExternalId: string,
  normalizedTitle: string
): Promise<Doc<'boards'>> =>
{
  // include soft-deleted rows so we don't accidentally insert a second row w/
  // the same owner-scoped externalId. local boards survive sign-out, so another
  // owner may legitimately reuse the same externalId
  let board = await findOwnedBoardByExternalIdIncludingDeleted(
    ctx,
    boardExternalId,
    userId
  )

  if (!board)
  {
    const boardId = await ctx.db.insert('boards', {
      externalId: boardExternalId,
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
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.boardDeleted,
      message: 'cannot sync to a deleted board',
    })
  }

  return board
}

// --- phase 3: apply diff & parallel writes -----------------------------------

const resolveMediaReferences = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  items: UpsertArgs['items']
): Promise<Map<string, Id<'mediaAssets'>>> =>
{
  const mediaExternalIds = new Set<string>()
  for (const item of items)
  {
    if (item.mediaExternalId) mediaExternalIds.add(item.mediaExternalId)
  }

  // parallel lookups — media table is indexed by externalId & requests are independent
  const results = await Promise.all(
    [...mediaExternalIds].map(async (extId) =>
    {
      const asset = await findOwnedMediaAssetByExternalId(ctx, extId, userId)
      if (!asset)
      {
        // fail loudly — silently dropping media references was masking real
        // bugs (orphaned items pointing at nothing)
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `media not found or not owned: ${extId}`,
        })
      }
      return [extId, asset._id] as const
    })
  )

  return new Map(results)
}

const applyBoardState = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  board: Doc<'boards'>,
  args: UpsertArgs,
  normalizedTitle: string
): Promise<number> =>
{
  const { serverTiers, serverItems } = await loadBoundedBoardRows(
    ctx,
    board._id
  )

  const tierDiff = diffTiers(args.tiers, serverTiers)

  // parallel tier removes + patches — independent writes
  await Promise.all([
    ...[...tierDiff.remove].map((tierId) => ctx.db.delete(tierId)),
    ...tierDiff.patch.map(({ id, fields }) => ctx.db.patch(id, fields)),
  ])

  // parallel tier inserts — IDs collected via Promise.all preserving order
  const insertedTierIds = await Promise.all(
    tierDiff.insert.map((tier) =>
      ctx.db.insert('boardTiers', {
        boardId: board._id,
        externalId: tier.externalId,
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order: tier.order,
      })
    )
  )

  const tierExternalIdToId = new Map<string, Id<'boardTiers'>>()
  for (const tier of serverTiers)
  {
    if (!tierDiff.remove.has(tier._id))
    {
      tierExternalIdToId.set(tier.externalId, tier._id)
    }
  }
  tierDiff.insert.forEach((tier, i) =>
  {
    tierExternalIdToId.set(tier.externalId, insertedTierIds[i])
  })

  const mediaExternalIdToId = await resolveMediaReferences(
    ctx,
    userId,
    args.items
  )

  const deletedItemExternalIds = new Set(args.deletedItemIds)
  const itemDiff = diffItems(
    args.items,
    serverItems,
    tierExternalIdToId,
    mediaExternalIdToId,
    deletedItemExternalIds
  )

  // parallel item writes across all three phases — softDelete/patch/insert are
  // independent rows
  await Promise.all([
    ...itemDiff.softDelete.map(({ id, deletedAt }) =>
      ctx.db.patch(id, { deletedAt })
    ),
    ...itemDiff.patch.map(({ id, fields }) => ctx.db.patch(id, fields)),
    ...itemDiff.insert.map((item) =>
      ctx.db.insert('boardItems', {
        boardId: board._id,
        ...item,
      })
    ),
  ])

  // skip the revision bump when nothing actually changed — other devices
  // otherwise see a stale "updated" ping & re-download for no edits
  const tiersChanged =
    tierDiff.remove.size > 0 ||
    tierDiff.patch.length > 0 ||
    tierDiff.insert.length > 0
  const itemsChanged =
    itemDiff.softDelete.length > 0 ||
    itemDiff.patch.length > 0 ||
    itemDiff.insert.length > 0
  const titleChanged = normalizedTitle !== board.title
  // treat aspect-ratio scalars the same as title — changes bump the revision
  const aspectChanged =
    board.itemAspectRatio !== args.itemAspectRatio ||
    board.itemAspectRatioMode !== args.itemAspectRatioMode ||
    (board.aspectRatioPromptDismissed ?? false) !==
      (args.aspectRatioPromptDismissed ?? false) ||
    board.defaultItemImageFit !== args.defaultItemImageFit

  const currentRevision = board.revision ?? 0
  if (!tiersChanged && !itemsChanged && !titleChanged && !aspectChanged)
  {
    return currentRevision
  }

  const newRevision = currentRevision + 1
  await ctx.db.patch(board._id, {
    title: normalizedTitle,
    updatedAt: Date.now(),
    revision: newRevision,
    itemAspectRatio: args.itemAspectRatio,
    itemAspectRatioMode: args.itemAspectRatioMode,
    aspectRatioPromptDismissed: args.aspectRatioPromptDismissed,
    defaultItemImageFit: args.defaultItemImageFit,
  })
  return newRevision
}

// --- orchestrator ------------------------------------------------------------

export const upsertBoardState = mutation({
  args: {
    boardExternalId: v.string(),
    baseRevision: v.union(v.number(), v.null()),
    title: v.string(),
    tiers: v.array(wireTierValidator),
    items: v.array(wireItemValidator),
    deletedItemIds: v.array(v.string()),
    ...boardAspectRatioValidators,
  },
  returns: v.union(
    v.object({ conflict: v.null(), newRevision: v.number() }),
    v.object({
      conflict: v.object({ serverRevision: v.number() }),
      newRevision: v.null(),
    })
  ),
  handler: async (ctx, args): Promise<UpsertResult> =>
  {
    const userId = await requireCurrentUserId(ctx)
    validateInputs(args)

    const normalizedTitle = normalizeBoardTitle(args.title)
    const board = await ensureBoard(
      ctx,
      userId,
      args.boardExternalId,
      normalizedTitle
    )

    // cheap revision compare BEFORE scanning rows — a conflict response no
    // longer needs to load the full server state (~4000 rows). client follows
    // up w/ getBoardStateByExternalId to populate the conflict UI
    const currentRevision = board.revision ?? 0
    if (args.baseRevision !== null && args.baseRevision !== currentRevision)
    {
      return {
        conflict: { serverRevision: currentRevision },
        newRevision: null,
      }
    }

    const newRevision = await applyBoardState(
      ctx,
      userId,
      board,
      args,
      normalizedTitle
    )
    return { conflict: null, newRevision }
  },
})
