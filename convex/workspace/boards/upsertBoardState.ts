// convex/workspace/boards/upsertBoardState.ts
// reconciling mutation split into validate / ensureBoard / apply phases

import { ConvexError, v, type Infer } from 'convex/values'
import { mutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  boardLabelSettingsEqual,
  isValidLabelFontSizePx,
  ITEM_TRANSFORM_LIMITS,
  LABEL_FONT_SIZE_PX_MAX,
  LABEL_FONT_SIZE_PX_MIN,
  normalizeBoardTitle,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  PaletteId,
  TextStyleId,
} from '@tierlistbuilder/contracts/lib/theme'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import { validateHexColor } from '../../lib/hexColor'
import { failInput } from '../../lib/text'
import {
  boardLabelSettingsValidator,
  itemLabelOptionsValidator,
  itemTransformValidator,
  paletteIdValidator,
  textStyleIdValidator,
  tierColorSpecValidator,
} from '../../lib/validators'
import type {
  BoardLabelSettings,
  LabelPlacement,
} from '@tierlistbuilder/contracts/workspace/board'
import { diffTiers, diffItems } from '../sync/boardReconciler'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'
import { MAX_SYNC_ITEMS, MAX_SYNC_TIERS } from '../../lib/limits'
import { assertCanCloudSyncBoard } from '../../lib/entitlements'
import {
  findOwnedBoardByExternalIdIncludingDeleted,
  findMediaAssetByExternalId,
} from '../../lib/permissions'
import {
  countTemplateProgressItems,
  resolveTemplateProgressState,
  type TemplateProgressCounts,
} from '../../lib/templateProgress'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
} from './librarySummary'
import { buildFreshBoardCloudFields } from './cloudFields'

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
  transform: v.optional(itemTransformValidator),
  labelOptions: v.optional(itemLabelOptionsValidator),
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

// per-board style override args — validators match CloudBoardStyleOverrideFields.
// each field absent on the wire means "no override; inherit user default"
const boardStyleOverrideValidators = {
  paletteId: v.optional(paletteIdValidator),
  textStyleId: v.optional(textStyleIdValidator),
  pageBackground: v.optional(v.string()),
  labels: v.optional(boardLabelSettingsValidator),
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
  paletteId?: PaletteId
  textStyleId?: TextStyleId
  pageBackground?: string
  labels?: BoardLabelSettings
}

interface ResolvedMediaReference
{
  assetId: Id<'mediaAssets'>
  storageId: Id<'_storage'>
}

const validateLabelPlacement = (
  placement: LabelPlacement | undefined,
  field: string
): void =>
{
  if (!placement || placement.mode !== 'overlay') return
  if (!Number.isFinite(placement.x) || placement.x < 0 || placement.x > 1)
  {
    failInput(`invalid ${field}.x: must be within [0, 1]`)
  }
  if (!Number.isFinite(placement.y) || placement.y < 0 || placement.y > 1)
  {
    failInput(`invalid ${field}.y: must be within [0, 1]`)
  }
}

const validateLabelFontSize = (
  fontSizePx: number | undefined,
  field: string
): void =>
{
  if (fontSizePx === undefined) return
  if (!isValidLabelFontSizePx(fontSizePx))
  {
    failInput(
      `invalid ${field}: must be within [${LABEL_FONT_SIZE_PX_MIN}, ${LABEL_FONT_SIZE_PX_MAX}]`
    )
  }
}

type UpsertResult =
  | { conflict: null; newRevision: number }
  | { conflict: { serverRevision: number }; newRevision: null }

// --- phase 1: validate inputs ------------------------------------------------

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
    if (item.transform)
    {
      const { zoom, offsetX, offsetY } = item.transform
      if (!Number.isFinite(zoom) || zoom < ITEM_TRANSFORM_LIMITS.zoomMin)
      {
        failInput(
          `invalid item.transform.zoom: must be >= ${ITEM_TRANSFORM_LIMITS.zoomMin}`
        )
      }
      if (zoom > ITEM_TRANSFORM_LIMITS.zoomMax)
      {
        failInput(
          `invalid item.transform.zoom: must be <= ${ITEM_TRANSFORM_LIMITS.zoomMax}`
        )
      }
      if (
        !Number.isFinite(offsetX) ||
        offsetX < ITEM_TRANSFORM_LIMITS.offsetMin ||
        offsetX > ITEM_TRANSFORM_LIMITS.offsetMax
      )
      {
        failInput(
          `invalid item.transform.offsetX: must be within [${ITEM_TRANSFORM_LIMITS.offsetMin}, ${ITEM_TRANSFORM_LIMITS.offsetMax}]`
        )
      }
      if (
        !Number.isFinite(offsetY) ||
        offsetY < ITEM_TRANSFORM_LIMITS.offsetMin ||
        offsetY > ITEM_TRANSFORM_LIMITS.offsetMax
      )
      {
        failInput(
          `invalid item.transform.offsetY: must be within [${ITEM_TRANSFORM_LIMITS.offsetMin}, ${ITEM_TRANSFORM_LIMITS.offsetMax}]`
        )
      }
    }
    validateLabelPlacement(
      item.labelOptions?.placement,
      'item.labelOptions.placement'
    )
    validateLabelFontSize(
      item.labelOptions?.fontSizePx,
      'item.labelOptions.fontSizePx'
    )
  }

  for (const deletedId of args.deletedItemIds)
  {
    if (deletedId.length < 1 || deletedId.length > 128)
    {
      failInput('invalid itemExternalId: length must be 1..128')
    }
  }

  if (args.pageBackground !== undefined)
  {
    validateHexColor(args.pageBackground, 'pageBackground')
  }
  validateLabelPlacement(args.labels?.placement, 'labels.placement')
  validateLabelFontSize(args.labels?.fontSizePx, 'labels.fontSizePx')
}

// --- phase 2: ensure board + early revision check ----------------------------

const ensureBoard = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  boardExternalId: string,
  normalizedTitle: string,
  progressCounts: TemplateProgressCounts
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
      sourceTemplateId: null,
      sourceTemplateCategory: null,
      sourceTemplateSizeClass: null,
      ...buildFreshBoardCloudFields(Date.now()),
      ...progressCounts,
      templateProgressState: resolveTemplateProgressState(null, progressCounts),
      librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
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

interface ResolvedMediaState
{
  // wire-side externalId -> asset row (referenced by new/changed items)
  mediaExternalIdToReference: Map<string, ResolvedMediaReference>
  // wire-side itemExternalId -> existing tile storageId for items that did
  // NOT include a mediaExternalId on the wire (the server keeps the existing
  // reference). populated from serverItems' mediaAssetIds, deduped via assetCache
  serverStorageByItemExternalId: Map<string, Id<'_storage'>>
}

const resolveMediaState = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  items: UpsertArgs['items'],
  serverItems: readonly Doc<'boardItems'>[]
): Promise<ResolvedMediaState> =>
{
  const serverItemsByExternalId = new Map(
    serverItems.map((item) => [item.externalId, item])
  )
  const existingMediaAssetIds = new Set(
    serverItems
      .map((item) => item.mediaAssetId)
      .filter((id): id is Id<'mediaAssets'> => id !== null)
  )

  // shared cache keyed by mediaAssetId — wire-resolution & server-fallback
  // paths both populate & consume so each asset is fetched at most once
  const assetCache = new Map<
    Id<'mediaAssets'>,
    Promise<Doc<'mediaAssets'> | null>
  >()
  const cachedGet = (
    mediaAssetId: Id<'mediaAssets'>
  ): Promise<Doc<'mediaAssets'> | null> =>
  {
    const cached = assetCache.get(mediaAssetId)
    if (cached) return cached
    const pending = ctx.db.get(mediaAssetId)
    assetCache.set(mediaAssetId, pending)
    return pending
  }

  const mediaExternalIds = new Set<string>()
  const serverFallbackAssetIds = new Set<Id<'mediaAssets'>>()

  for (const item of items)
  {
    if (item.mediaExternalId)
    {
      mediaExternalIds.add(item.mediaExternalId)
      continue
    }
    if (item.mediaExternalId !== undefined) continue
    const mediaAssetId = serverItemsByExternalId.get(
      item.externalId
    )?.mediaAssetId
    if (mediaAssetId) serverFallbackAssetIds.add(mediaAssetId)
  }

  const wireEntries = await Promise.all(
    [...mediaExternalIds].map(async (extId) =>
    {
      const asset = await findMediaAssetByExternalId(ctx, extId)
      if (!asset)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `media not found or not owned: ${extId}`,
        })
      }
      if (asset.ownerId !== userId && !existingMediaAssetIds.has(asset._id))
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.forbidden,
          message: `media not owned by this account: ${extId}`,
        })
      }
      assetCache.set(asset._id, Promise.resolve(asset))
      return [
        extId,
        { assetId: asset._id, storageId: asset.tileVariant.storageId },
      ] as const
    })
  )

  await Promise.all([...serverFallbackAssetIds].map(cachedGet))

  const serverStorageByItemExternalId = new Map<string, Id<'_storage'>>()
  for (const item of items)
  {
    if (item.mediaExternalId !== undefined) continue
    const mediaAssetId = serverItemsByExternalId.get(
      item.externalId
    )?.mediaAssetId
    if (!mediaAssetId) continue
    const asset = await cachedGet(mediaAssetId)
    if (asset)
    {
      serverStorageByItemExternalId.set(
        item.externalId,
        asset.tileVariant.storageId
      )
    }
  }

  return {
    mediaExternalIdToReference: new Map(wireEntries),
    serverStorageByItemExternalId,
  }
}

const resolveLibrarySummaryStorageId = (
  item: UpsertArgs['items'][number],
  mediaExternalIdToReference: Map<string, ResolvedMediaReference>,
  serverStorageByItemExternalId: ReadonlyMap<string, Id<'_storage'>>
): Id<'_storage'> | null =>
{
  // wire field absent -> keep the existing server-side reference (if any)
  if (item.mediaExternalId === undefined)
  {
    return serverStorageByItemExternalId.get(item.externalId) ?? null
  }
  // wire field present but null -> caller cleared the media reference
  if (!item.mediaExternalId) return null
  // wire field present w/ id -> use the resolved reference's tile storage
  return mediaExternalIdToReference.get(item.mediaExternalId)?.storageId ?? null
}

const buildLibrarySummaryFromArgs = (
  args: UpsertArgs,
  deletedItemExternalIds: ReadonlySet<string>,
  mediaExternalIdToReference: Map<string, ResolvedMediaReference>,
  serverStorageByItemExternalId: ReadonlyMap<string, Id<'_storage'>>
) =>
  buildBoardLibrarySummary({
    tiers: args.tiers.map((tier, order) => ({
      key: tier.externalId,
      order,
      colorSpec: tier.colorSpec,
    })),
    items: args.items.map((item) => ({
      tierKey: item.tierId,
      externalId: item.externalId,
      label: item.label,
      storageId: resolveLibrarySummaryStorageId(
        item,
        mediaExternalIdToReference,
        serverStorageByItemExternalId
      ),
      order: item.order,
      deletedAt: deletedItemExternalIds.has(item.externalId) ? 1 : null,
    })),
  })

const applyBoardState = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  board: Doc<'boards'>,
  args: UpsertArgs,
  normalizedTitle: string,
  progressCounts: TemplateProgressCounts,
  deletedItemExternalIds: ReadonlySet<string>
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

  const { mediaExternalIdToReference, serverStorageByItemExternalId } =
    await resolveMediaState(ctx, userId, args.items, serverItems)
  const mediaExternalIdToId = new Map(
    [...mediaExternalIdToReference.entries()].map(([externalId, ref]) => [
      externalId,
      ref.assetId,
    ])
  )

  const itemDiff = diffItems(
    args.items,
    serverItems,
    tierExternalIdToId,
    mediaExternalIdToId,
    deletedItemExternalIds
  )
  const librarySummary = buildLibrarySummaryFromArgs(
    args,
    deletedItemExternalIds,
    mediaExternalIdToReference,
    serverStorageByItemExternalId
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
  const aspectChanged =
    board.itemAspectRatio !== args.itemAspectRatio ||
    board.itemAspectRatioMode !== args.itemAspectRatioMode ||
    (board.aspectRatioPromptDismissed ?? false) !==
      (args.aspectRatioPromptDismissed ?? false) ||
    board.defaultItemImageFit !== args.defaultItemImageFit
  const styleOverrideChanged =
    board.paletteId !== args.paletteId ||
    board.textStyleId !== args.textStyleId ||
    board.pageBackground !== args.pageBackground ||
    !boardLabelSettingsEqual(board.labels, args.labels)
  const templateProgressState = resolveTemplateProgressState(
    board.sourceTemplateId,
    progressCounts
  )
  const progressChanged =
    board.activeItemCount !== progressCounts.activeItemCount ||
    board.unrankedItemCount !== progressCounts.unrankedItemCount ||
    board.templateProgressState !== templateProgressState

  const currentRevision = board.revision ?? 0
  if (
    !tiersChanged &&
    !itemsChanged &&
    !titleChanged &&
    !aspectChanged &&
    !styleOverrideChanged &&
    !progressChanged
  )
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
    paletteId: args.paletteId,
    textStyleId: args.textStyleId,
    pageBackground: args.pageBackground,
    labels: args.labels,
    activeItemCount: progressCounts.activeItemCount,
    unrankedItemCount: progressCounts.unrankedItemCount,
    templateProgressState,
    librarySummary,
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
    ...boardStyleOverrideValidators,
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
    const deletedItemExternalIds = new Set(args.deletedItemIds)
    const progressCounts = countTemplateProgressItems(
      args.items,
      deletedItemExternalIds
    )
    await assertCanCloudSyncBoard(ctx, userId, progressCounts.activeItemCount)

    const normalizedTitle = normalizeBoardTitle(args.title)
    const board = await ensureBoard(
      ctx,
      userId,
      args.boardExternalId,
      normalizedTitle,
      progressCounts
    )

    // cheap revision compare BEFORE loading rows — a conflict response avoids
    // scanning the full server state. client follows up w/ getBoardStateByExternalId
    // to populate the conflict UI
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
      normalizedTitle,
      progressCounts,
      deletedItemExternalIds
    )
    return { conflict: null, newRevision }
  },
})
