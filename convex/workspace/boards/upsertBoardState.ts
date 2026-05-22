// convex/workspace/boards/upsertBoardState.ts
// reconciling mutation split into validate / ensureBoard / apply phases

import { ConvexError, v, type Infer } from 'convex/values'
import { mutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  boardAutoPlateSettingsEqual,
  boardLabelSettingsEqual,
  IMAGE_PADDING_MAX,
  IMAGE_PADDING_MIN,
  isValidLabelFontSizePx,
  ITEM_TRANSFORM_LIMITS,
  LABEL_FONT_SIZE_PX_MAX,
  LABEL_FONT_SIZE_PX_MIN,
  normalizeBoardTitle,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  BOARD_ITEM_ASPECT_RATIO_MAX,
  BOARD_ITEM_ASPECT_RATIO_MIN,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import {
  findRankingBySlug,
  findTemplateBySlug,
} from '../../lib/marketplaceLookups'
import { loadTemplateItems } from '../../marketplace/templates/lib/projections'
import { incrementTemplateForkStatsById } from '../../marketplace/templates/lib/writes'
import { findActiveTemplateCriterion } from '../../marketplace/templates/criteria'
import { rankingTopScore } from '../../marketplace/rankings/lib'
import type {
  PaletteId,
  TextStyleId,
} from '@tierlistbuilder/contracts/lib/theme'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import { validateHexColor } from '../../lib/hexColor'
import { assertStringLength, failInput } from '../../lib/text'
import {
  assertExternalIdShape,
  assertFiniteRange,
  assertPositiveFinite,
  assertUniqueValues,
} from '../../lib/assertions'
import { memoizePromise } from '../../lib/cache'
import {
  boardAutoPlateSettingsValidator,
  boardLabelSettingsValidator,
  itemLabelOptionsValidator,
  itemTransformValidator,
  mediaPlateValidator,
  paletteIdValidator,
  textStyleIdValidator,
  tierColorSpecValidator,
} from '../../lib/validators/common'
import type {
  BoardAutoPlateSettings,
  BoardLabelSettings,
  LabelPlacement,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  isBoardId,
  isMediaAssetExternalId,
  isTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import { diffTiers, diffItems } from '../sync/boardReconciler'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'
import { loadBoardCloudState } from '../sync/boardStateLoader'
import { cloudBoardStateValidator } from '../../lib/validators/workspace'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { MAX_SYNC_ITEMS, MAX_SYNC_TIERS } from '../../lib/limits'
import { assertCanCloudSyncBoard } from '../../lib/entitlements'
import {
  findOwnedBoardByExternalIdIncludingDeleted,
  findMediaAssetByExternalId,
} from '../../lib/permissions'
import { selectPreviewOrTileStorageId } from '../../lib/mediaVariants'
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
import {
  boardSourceRankingFromMaybeRanking,
  boardSourceTemplateFromMaybeTemplate,
  getBoardSourceRankingId,
  getBoardSourceTemplateId,
} from './sourceFields'

const MAX_LABEL_LEN = 200
const MAX_ALT_LEN = 500
const MAX_NOTES_LEN = 2000
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
  mediaPlate: v.optional(mediaPlateValidator),
  altText: v.optional(v.string()),
  notes: v.optional(v.string()),
  mediaExternalId: v.optional(v.union(v.string(), v.null())),
  order: v.number(),
  aspectRatio: v.optional(v.number()),
  imageFit: v.optional(v.union(v.literal('cover'), v.literal('contain'))),
  transform: v.optional(itemTransformValidator),
  imagePadding: v.optional(v.number()),
  labelOptions: v.optional(itemLabelOptionsValidator),
  sourceTemplateItemExternalId: v.optional(v.string()),
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
  defaultItemImagePadding: v.optional(v.number()),
}

// per-board style override args — validators match CloudBoardStyleOverrideFields.
// each field absent on the wire means "no override; inherit user default"
const boardStyleOverrideValidators = {
  paletteId: v.optional(paletteIdValidator),
  textStyleId: v.optional(textStyleIdValidator),
  pageBackground: v.optional(v.string()),
  labels: v.optional(boardLabelSettingsValidator),
  autoPlate: v.optional(boardAutoPlateSettingsValidator),
}

// source-fork identity carried by locally-created forks/remixes — only
// consulted on the INSERT path of ensureBoard. subsequent syncs ignore these
// fields so the server stays the source of truth post-first-sync
const boardSourceValidators = {
  sourceTemplateId: v.optional(v.string()),
  sourceRankingId: v.optional(v.string()),
  sourceTemplateTitle: v.optional(v.string()),
  sourceRankingTitle: v.optional(v.string()),
  preferredCriterionExternalId: v.optional(v.string()),
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
  defaultItemImagePadding?: number
  paletteId?: PaletteId
  textStyleId?: TextStyleId
  pageBackground?: string
  labels?: BoardLabelSettings
  autoPlate?: BoardAutoPlateSettings
  sourceTemplateId?: string
  sourceRankingId?: string
  sourceTemplateTitle?: string
  sourceRankingTitle?: string
  preferredCriterionExternalId?: string
}

interface ResolvedMediaReference
{
  assetId: Id<'mediaAssets'>
  storageId: Id<'_storage'>
}

interface NormalizedBoardWriteFields
{
  itemAspectRatio: number | null
  itemAspectRatioMode: 'auto' | 'manual' | null
  aspectRatioPromptDismissed: boolean
  defaultItemImageFit: 'cover' | 'contain' | null
  defaultItemImagePadding: number | null
  paletteId: PaletteId | null
  textStyleId: TextStyleId | null
  pageBackground: string | null
  labels: BoardLabelSettings | null
  autoPlate?: BoardAutoPlateSettings
}

const normalizeBoardWriteFields = (
  args: UpsertArgs
): NormalizedBoardWriteFields => ({
  itemAspectRatio: args.itemAspectRatio ?? null,
  itemAspectRatioMode: args.itemAspectRatioMode ?? null,
  aspectRatioPromptDismissed: args.aspectRatioPromptDismissed ?? false,
  defaultItemImageFit: args.defaultItemImageFit ?? null,
  defaultItemImagePadding: args.defaultItemImagePadding ?? null,
  paletteId: args.paletteId ?? null,
  textStyleId: args.textStyleId ?? null,
  pageBackground: args.pageBackground ?? null,
  labels: args.labels ?? null,
  autoPlate: args.autoPlate,
})

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

const validateBoardAutoPlate = (
  autoPlate: BoardAutoPlateSettings | undefined
): void =>
{
  if (autoPlate?.mode !== 'uniform' || autoPlate.uniformColor === undefined)
  {
    return
  }
  validateHexColor(autoPlate.uniformColor, 'autoPlate.uniformColor')
}

const validateImagePadding = (
  padding: number | undefined,
  field: string
): void =>
{
  if (padding === undefined) return
  assertFiniteRange(field, padding, IMAGE_PADDING_MIN, IMAGE_PADDING_MAX)
}

const validateBoardAspectRatio = (
  aspectRatio: number | undefined,
  field: string
): void =>
{
  if (aspectRatio === undefined) return
  assertFiniteRange(
    field,
    aspectRatio,
    BOARD_ITEM_ASPECT_RATIO_MIN,
    BOARD_ITEM_ASPECT_RATIO_MAX
  )
}

type UpsertResult =
  | { conflict: null; newRevision: number }
  | { conflict: { serverState: CloudBoardState }; newRevision: null }

// --- phase 1: validate inputs ------------------------------------------------

const validateInputs = (args: UpsertArgs): void =>
{
  assertExternalIdShape(
    'boardExternalId',
    args.boardExternalId,
    isBoardId,
    'board-'
  )

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
  assertUniqueValues(
    'tierExternalId',
    args.tiers.map((tier) => tier.externalId)
  )
  assertUniqueValues(
    'itemExternalId',
    args.items.map((item) => item.externalId)
  )
  assertUniqueValues('deletedItemExternalId', args.deletedItemIds)

  // per-field bounds — prevents a client from smuggling oversized blobs
  // (Convex caps strings at 1MB but a run of ~999KB labels still adds up)
  for (const tier of args.tiers)
  {
    assertExternalIdShape('tierExternalId', tier.externalId, isTierId, 'tier-')
    assertStringLength(
      'tier name',
      tier.name,
      MAX_TIER_NAME_LEN,
      ({ length, maxLength }) =>
        `tier name too long: ${length} exceeds ${maxLength}`
    )
    assertStringLength(
      'tier description',
      tier.description,
      MAX_TIER_DESCRIPTION_LEN,
      ({ maxLength }) => `tier description too long: exceeds ${maxLength}`
    )
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
    assertStringLength(
      'item label',
      item.label,
      MAX_LABEL_LEN,
      ({ maxLength }) => `item label too long: exceeds ${maxLength} chars`
    )
    assertStringLength(
      'item altText',
      item.altText,
      MAX_ALT_LEN,
      ({ maxLength }) => `item altText too long: exceeds ${maxLength} chars`
    )
    assertStringLength(
      'item notes',
      item.notes,
      MAX_NOTES_LEN,
      ({ maxLength }) => `item notes too long: exceeds ${maxLength} chars`
    )
    assertStringLength(
      'item backgroundColor',
      item.backgroundColor,
      MAX_BACKGROUND_COLOR_LEN,
      ({ maxLength }) =>
        `item backgroundColor too long: exceeds ${maxLength} chars`
    )
    if (item.backgroundColor)
    {
      validateHexColor(item.backgroundColor, 'item.backgroundColor')
    }
    if (item.aspectRatio !== undefined)
    {
      assertPositiveFinite('item.aspectRatio', item.aspectRatio)
    }
    if (item.mediaExternalId)
    {
      assertExternalIdShape(
        'mediaExternalId',
        item.mediaExternalId,
        isMediaAssetExternalId,
        'media-'
      )
    }
    if (
      item.sourceTemplateItemExternalId !== undefined &&
      (item.sourceTemplateItemExternalId.length < 1 ||
        item.sourceTemplateItemExternalId.length > 128)
    )
    {
      failInput('invalid sourceTemplateItemExternalId: length must be 1..128')
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
    validateImagePadding(item.imagePadding, 'item.imagePadding')
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
  validateBoardAspectRatio(args.itemAspectRatio, 'itemAspectRatio')
  validateImagePadding(args.defaultItemImagePadding, 'defaultItemImagePadding')
  validateLabelPlacement(args.labels?.placement, 'labels.placement')
  validateLabelFontSize(args.labels?.fontSizePx, 'labels.fontSizePx')
  validateBoardAutoPlate(args.autoPlate)
}

// --- phase 2: ensure board + early revision check ----------------------------

interface EnsureBoardResult
{
  board: Doc<'boards'>
  isNewBoard: boolean
}

// resolve a client-supplied slug into a typed template row, tolerating missing
// or unpublished sources (the local fork might have referenced a template that
// was later unpublished). returns null when no live template matches the slug
const resolveSourceTemplateBySlug = async (
  ctx: MutationCtx,
  slug: string | undefined
): Promise<Doc<'templates'> | null> =>
{
  if (!slug) return null
  return await findTemplateBySlug(ctx, slug)
}

const resolveSourceRankingBySlug = async (
  ctx: MutationCtx,
  slug: string | undefined
): Promise<Doc<'publishedRankings'> | null> =>
{
  if (!slug) return null
  return await findRankingBySlug(ctx, slug)
}

const ensureBoard = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: UpsertArgs,
  normalizedTitle: string,
  progressCounts: TemplateProgressCounts
): Promise<EnsureBoardResult> =>
{
  // include soft-deleted rows so we don't accidentally insert a second row w/
  // the same owner-scoped externalId. local boards survive sign-out, so another
  // owner may legitimately reuse the same externalId
  let board = await findOwnedBoardByExternalIdIncludingDeleted(
    ctx,
    args.boardExternalId,
    userId
  )
  let isNewBoard = false

  if (!board)
  {
    // first sync of a locally-created board — args carry public slugs (the
    // only identifier signed-out users have); resolve to typed ids server-side.
    // orchestrator ticks the fork counter post-insert via the forkCounted flag
    const [sourceTemplate, sourceRanking] = await Promise.all([
      resolveSourceTemplateBySlug(ctx, args.sourceTemplateId),
      resolveSourceRankingBySlug(ctx, args.sourceRankingId),
    ])
    const now = Date.now()
    const writeFields = normalizeBoardWriteFields(args)
    const boardId = await ctx.db.insert('boards', {
      externalId: args.boardExternalId,
      ownerId: userId,
      title: normalizedTitle,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 0,
      ...writeFields,
      // Prefer resolved server rows; when a row disappeared after a local fork,
      // keep the client title inside the grouped attribution object.
      sourceTemplate: boardSourceTemplateFromMaybeTemplate(
        sourceTemplate,
        args.sourceTemplateTitle
      ),
      sourceRanking: boardSourceRankingFromMaybeRanking(
        sourceRanking,
        args.sourceRankingTitle
      ),
      preferredCriterionExternalId: sourceTemplate
        ? (findActiveTemplateCriterion(
            sourceTemplate,
            args.preferredCriterionExternalId
          )?.externalId ?? null)
        : null,
      // false here; orchestrator ticks the counter post-insert & flips this true
      forkCounted: false,
      ...buildFreshBoardCloudFields(now),
      ...progressCounts,
      templateProgressState: resolveTemplateProgressState(
        sourceTemplate?._id ?? null,
        progressCounts
      ),
      librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
      seedDatasetKey: null,
      seedReleaseId: null,
      seedExternalId: null,
      seedContentHash: null,
      seedKind: null,
      seedReleaseStatus: null,
    })
    board = (await ctx.db.get(boardId))!
    isNewBoard = true
  }

  if (board.deletedAt !== null)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.boardDeleted,
      message: 'cannot sync to a deleted board',
    })
  }
  if (board.materializationState !== 'ready')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'cannot sync a board while it is materializing',
    })
  }

  return { board, isNewBoard }
}

// fork-counter trigger for first sync of a sourceTemplate-bearing board.
// idempotent via forkCounted — paired w/ inline ticks in useTemplate/remix
// (those flip forkCounted true at insert so this path leaves them alone)
const tickForkCounterIfFirstSync = async (
  ctx: MutationCtx,
  board: Doc<'boards'>
): Promise<void> =>
{
  if (board.forkCounted) return
  const sourceTemplateId = getBoardSourceTemplateId(board)
  if (sourceTemplateId === null) return

  const now = Date.now()
  await incrementTemplateForkStatsById(ctx, sourceTemplateId, now)

  const sourceRankingId = getBoardSourceRankingId(board)
  if (sourceRankingId !== null)
  {
    const ranking = await ctx.db.get(sourceRankingId)
    if (ranking)
    {
      const nextRemixCount = ranking.remixCount + 1
      await ctx.db.patch(ranking._id, {
        remixCount: nextRemixCount,
        topScore: rankingTopScore({
          viewCount: ranking.viewCount,
          remixCount: nextRemixCount,
        }),
        updatedAt: now,
      })
    }
  }

  await ctx.db.patch(board._id, { forkCounted: true })
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
    memoizePromise(assetCache, mediaAssetId, () => ctx.db.get(mediaAssetId))

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
        { assetId: asset._id, storageId: selectPreviewOrTileStorageId(asset) },
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
        selectPreviewOrTileStorageId(asset)
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
  // wire field present w/ id -> use the resolved reference's preview storage
  // (falls back to tile for assets predating the preview pipeline)
  return mediaExternalIdToReference.get(item.mediaExternalId)?.storageId ?? null
}

const resolveSourceTemplateItemIds = async (
  ctx: MutationCtx,
  sourceTemplateId: Id<'templates'> | null,
  items: UpsertArgs['items']
): Promise<Map<string, Id<'templateItems'>>> =>
{
  if (sourceTemplateId === null) return new Map()

  const externalIds = [
    ...new Set(
      items
        .map((item) => item.sourceTemplateItemExternalId)
        .filter((externalId): externalId is string => !!externalId)
    ),
  ]
  if (externalIds.length === 0) return new Map()

  const requestedExternalIds = new Set(externalIds)
  const templateItems = await loadTemplateItems(ctx, sourceTemplateId)
  return new Map(
    templateItems
      .filter((item) => requestedExternalIds.has(item.externalId))
      .map((item) => [item.externalId, item._id])
  )
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
  const templateItemExternalIdToId = await resolveSourceTemplateItemIds(
    ctx,
    getBoardSourceTemplateId(board),
    args.items
  )

  const itemDiff = diffItems(
    args.items,
    serverItems,
    tierExternalIdToId,
    mediaExternalIdToId,
    deletedItemExternalIds,
    templateItemExternalIdToId
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
    ...itemDiff.softDelete.map(({ id, deletedAt, fields }) =>
      ctx.db.patch(id, { ...fields, deletedAt })
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
  const writeFields = normalizeBoardWriteFields(args)
  const aspectChanged =
    board.itemAspectRatio !== writeFields.itemAspectRatio ||
    board.itemAspectRatioMode !== writeFields.itemAspectRatioMode ||
    board.aspectRatioPromptDismissed !==
      writeFields.aspectRatioPromptDismissed ||
    board.defaultItemImageFit !== writeFields.defaultItemImageFit ||
    (board.defaultItemImagePadding ?? null) !==
      writeFields.defaultItemImagePadding
  const styleOverrideChanged =
    board.paletteId !== writeFields.paletteId ||
    board.textStyleId !== writeFields.textStyleId ||
    board.pageBackground !== writeFields.pageBackground ||
    !boardLabelSettingsEqual(board.labels, writeFields.labels) ||
    !boardAutoPlateSettingsEqual(board.autoPlate, writeFields.autoPlate)
  const templateProgressState = resolveTemplateProgressState(
    getBoardSourceTemplateId(board),
    progressCounts
  )
  const progressChanged =
    board.activeItemCount !== progressCounts.activeItemCount ||
    board.unrankedItemCount !== progressCounts.unrankedItemCount ||
    board.templateProgressState !== templateProgressState

  const currentRevision = board.revision
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
    ...writeFields,
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
    ...boardSourceValidators,
  },
  returns: v.union(
    v.object({ conflict: v.null(), newRevision: v.number() }),
    v.object({
      // carry the full server snapshot in the conflict response so the client
      // resolves against exactly the revision that lost — no second round-trip
      // that could observe a newer, unreviewed revision mid-resolution
      conflict: v.object({ serverState: cloudBoardStateValidator }),
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
    const { board, isNewBoard } = await ensureBoard(
      ctx,
      userId,
      args,
      normalizedTitle,
      progressCounts
    )

    // tick the fork counter the first time a locally-forked board lands on
    // the server. paired w/ forkCounted: false at insert + true after tick so
    // re-syncs are no-ops. ranking remixCount bumps here too for sourceRanking
    if (isNewBoard)
    {
      await tickForkCounterIfFirstSync(ctx, board)
    }

    // conflict if another device committed since the client pulled (baseRevision
    // mismatch), or the client thinks this is a fresh board but the server holds
    // committed content (null baseRevision vs revision > 0) — reconcile, not clobber
    const currentRevision = board.revision
    const baseRevisionMismatch =
      args.baseRevision !== null && args.baseRevision !== currentRevision
    // isNewBoard is revision 0, so a genuine first sync is never caught here
    const staleNullBaseRevision =
      args.baseRevision === null && currentRevision > 0
    if (baseRevisionMismatch || staleNullBaseRevision)
    {
      // load the snapshot in THIS transaction so the client resolves against the
      // exact revision that lost — a follow-up query could observe a newer
      // revision from an interleaving flush (re-fetch TOCTOU)
      const { serverTiers, serverItems } = await loadBoundedBoardRows(
        ctx,
        board._id
      )
      const serverState = await loadBoardCloudState(
        ctx,
        board,
        serverTiers,
        serverItems
      )
      return {
        conflict: { serverState },
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
