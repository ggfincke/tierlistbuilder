// src/shared/board-data/boardSnapshot.ts
// board-data helpers — create, reset, extract, & normalize persisted boards

import {
  DEFAULT_TIER_IDS,
  DEFAULT_TIER_NAMES,
  DEFAULT_TITLE,
  buildDefaultTiers,
  createBoardTier,
} from '~/shared/board-data/boardDefaults'
import type {
  BoardSnapshot,
  Tier,
  TierItem,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  COVER_SURFACES,
  type CoverFrame,
  type TemplateCoverFraming,
  type TemplateMediaRef,
} from '@tierlistbuilder/contracts/lib/coverMedia'

import {
  asItemId,
  generateTierId,
  isTierId,
  type ItemId,
} from '@tierlistbuilder/contracts/lib/ids'
import {
  PALETTE_IDS,
  TEXT_STYLE_IDS,
  type PaletteId,
} from '@tierlistbuilder/contracts/lib/theme'
import { isHexColor } from '@tierlistbuilder/contracts/lib/hexColor'
import {
  getAutoTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '~/shared/theme/tierColors'
import {
  asNonEmptyString,
  isNonEmptyString,
  isRecord,
} from '~/shared/lib/typeGuards'
import {
  CLOUD_MEDIA_OWNERSHIPS,
  normalizeImagePadding,
  type CloudMediaOwnership,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ASPECT_RATIO_MODES,
  IMAGE_FITS,
  assignNormalizedItemScalars,
  normalizeBoardAutoPlate,
  normalizeBoardLabelSettings,
  normalizeEnum,
  normalizePositiveFinite,
} from '~/shared/board-data/boardNormalizers'
import { normalizeBoardItemAspectRatio } from '@tierlistbuilder/contracts/workspace/aspectRatio'

interface RawTier
{
  id?: unknown
  name?: unknown
  description?: unknown
  colorSpec?: unknown
  rowColorSpec?: unknown
  itemIds?: unknown
}

// per-call accumulators threaded through tier + item normalization so
// duplicate tier ids & dangling/duplicate item refs never reach dnd-kit
interface NormalizationContext
{
  items: Record<ItemId, TierItem>
  seenTierIds: Set<string>
  seenItemIds: Set<ItemId>
}

const normalizeItemIds = (
  raw: unknown,
  ctx: NormalizationContext
): ItemId[] =>
{
  if (!Array.isArray(raw)) return []

  const result: ItemId[] = []
  for (const value of raw)
  {
    if (typeof value !== 'string') continue
    const itemId = asItemId(value)
    if (ctx.seenItemIds.has(itemId) || !ctx.items[itemId]) continue
    ctx.seenItemIds.add(itemId)
    result.push(itemId)
  }
  return result
}

// pick a unique tier id (caller-supplied -> default-by-index -> generated) &
// claim it on the context so subsequent tiers can't collide
const claimTierId = (
  raw: unknown,
  index: number,
  ctx: NormalizationContext
): Tier['id'] =>
{
  const resolved = pickTierId(raw, index, ctx.seenTierIds)
  ctx.seenTierIds.add(resolved)
  return resolved
}

const pickTierId = (
  raw: unknown,
  index: number,
  seen: Set<string>
): Tier['id'] =>
{
  if (typeof raw === 'string' && isTierId(raw) && !seen.has(raw)) return raw

  const defaultId = DEFAULT_TIER_IDS[index]
  if (defaultId && !seen.has(defaultId)) return defaultId

  let generated = generateTierId()
  while (seen.has(generated)) generated = generateTierId()
  return generated
}

const isCloudMediaOwnership = (raw: unknown): raw is CloudMediaOwnership =>
  (CLOUD_MEDIA_OWNERSHIPS as readonly string[]).includes(raw as string)

const normalizeImageRef = (raw: unknown): TierItemImageRef | undefined =>
{
  if (!isRecord(raw)) return undefined
  if (!isNonEmptyString(raw.hash)) return undefined

  const cloudMediaExternalId = asNonEmptyString(raw.cloudMediaExternalId)
  return {
    hash: raw.hash,
    ...(cloudMediaExternalId !== undefined ? { cloudMediaExternalId } : {}),
    ...(isCloudMediaOwnership(raw.cloudMediaOwnership)
      ? { cloudMediaOwnership: raw.cloudMediaOwnership }
      : {}),
  }
}

const normalizeTemplateMediaRef = (
  raw: unknown
): TemplateMediaRef | undefined =>
{
  if (!isRecord(raw)) return undefined
  const externalId = asNonEmptyString(raw.externalId)
  const contentHash = asNonEmptyString(raw.contentHash)
  const url = asNonEmptyString(raw.url)
  const mimeType = asNonEmptyString(raw.mimeType)
  if (
    externalId === undefined ||
    contentHash === undefined ||
    url === undefined ||
    mimeType === undefined
  )
  {
    return undefined
  }

  const width = normalizePositiveFinite(raw.width)
  const height = normalizePositiveFinite(raw.height)
  if (width === undefined || height === undefined) return undefined

  return { externalId, contentHash, url, width, height, mimeType }
}

const normalizeCoverFrame = (raw: unknown): CoverFrame | null =>
{
  if (!isRecord(raw)) return null
  const { x, y } = raw
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y)
  )
  {
    return null
  }

  const width = normalizePositiveFinite(raw.width)
  const height = normalizePositiveFinite(raw.height)
  if (width === undefined || height === undefined) return null

  return { x, y, width, height }
}

// per-surface null is semantic ("this surface was not framed"); a fully-
// missing framing object collapses to undefined to match the contract's
// optional-only shape
const normalizeTemplateCoverFraming = (
  raw: unknown
): TemplateCoverFraming | undefined =>
{
  if (!isRecord(raw)) return undefined
  const framing = {} as TemplateCoverFraming
  for (const surface of COVER_SURFACES)
  {
    framing[surface] = normalizeCoverFrame(raw[surface])
  }
  return framing
}

// drop unknown fields & validate primitive shapes. items w/o a valid `id`
// are rejected
const normalizeTierItem = (raw: unknown): TierItem | null =>
{
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  const id = asItemId(raw.id)

  const imageRef = normalizeImageRef(raw.imageRef)
  const tileImageRef = normalizeImageRef(raw.tileImageRef)
  const sourceImageRef = normalizeImageRef(raw.sourceImageRef)
  const item: TierItem = { id }
  if (imageRef) item.imageRef = imageRef
  if (tileImageRef) item.tileImageRef = tileImageRef
  if (sourceImageRef) item.sourceImageRef = sourceImageRef
  assignNormalizedItemScalars(item, raw)
  return item
}

const normalizeItemMap = (raw: unknown): Record<ItemId, TierItem> =>
{
  if (!isRecord(raw)) return {}
  const result: Record<ItemId, TierItem> = {}
  for (const [key, value] of Object.entries(raw))
  {
    const normalized = normalizeTierItem(value)
    if (normalized) result[asItemId(key)] = normalized
  }
  return result
}

const normalizeItemList = (raw: unknown): TierItem[] =>
{
  if (!Array.isArray(raw)) return []
  const result: TierItem[] = []
  for (const entry of raw)
  {
    const normalized = normalizeTierItem(entry)
    if (normalized) result.push(normalized)
  }
  return result
}

const normalizeTier = (
  tier: RawTier,
  index: number,
  paletteId: PaletteId,
  ctx: NormalizationContext
): Tier =>
{
  const rowColorSpec = normalizeCanonicalTierColorSpec(tier.rowColorSpec)

  const normalized: Tier = {
    id: claimTierId(tier.id, index, ctx),
    name:
      typeof tier.name === 'string'
        ? tier.name
        : (DEFAULT_TIER_NAMES[index] ?? `Tier ${index + 1}`),
    description:
      typeof tier.description === 'string' ? tier.description : undefined,
    colorSpec:
      normalizeCanonicalTierColorSpec(tier.colorSpec) ??
      getAutoTierColorSpec(paletteId, index),
    itemIds: normalizeItemIds(tier.itemIds, ctx),
  }

  if (rowColorSpec) normalized.rowColorSpec = rowColorSpec
  return normalized
}

export const createInitialBoardData = (
  paletteId: PaletteId,
  title = DEFAULT_TITLE
): BoardSnapshot => ({
  title,
  tiers: buildDefaultTiers(paletteId),
  deletedItems: [],
  items: {},
  unrankedItemIds: [],
})

// build a single new tier w/ a generated ID & auto-assigned palette color
// name defaults to "Tier N+1"; callers pass a continued series name
export const createNewTier = (
  paletteId: PaletteId,
  tierCount: number,
  name = `Tier ${tierCount + 1}`
): Tier =>
  createBoardTier({
    id: generateTierId(),
    name,
    paletteId,
    index: tierCount,
  })

// authoritative list of BoardSnapshot fields persisted/synced as a unit.
// `satisfies` keeps projector & equality aligned w/ the contract — adding
// a snapshot field is a typecheck error here until the list grows too
const BOARD_DATA_SELECTION_KEYS = [
  'title',
  'tiers',
  'unrankedItemIds',
  'items',
  'deletedItems',
  'itemAspectRatio',
  'itemAspectRatioMode',
  'aspectRatioPromptDismissed',
  'defaultItemImageFit',
  'defaultItemImagePadding',
  'paletteId',
  'textStyleId',
  'pageBackground',
  'labels',
  'autoPlate',
  'imageStyleId',
  'sourceTemplateId',
  'sourceRankingId',
  'sourceTemplateTitle',
  'sourceRankingTitle',
  'sourceTemplateCoverMedia',
  'sourceTemplateCoverFraming',
  'preferredCriterionExternalId',
] as const satisfies readonly (keyof BoardSnapshot)[]

export const boardDataFieldsEqual = (
  a: BoardSnapshot,
  b: BoardSnapshot
): boolean =>
{
  for (const key of BOARD_DATA_SELECTION_KEYS)
  {
    if (a[key] !== b[key])
    {
      return false
    }
  }

  return true
}

// project the BoardSnapshot fields out of any superset (eg the active-board
// zustand store, which also carries actions & runtime-only state). derives
// the key list once so adding a snapshot field doesn't need a third edit here
export const extractBoardData = (state: BoardSnapshot): BoardSnapshot =>
{
  const result = {} as { [K in keyof BoardSnapshot]: BoardSnapshot[K] }
  for (const key of BOARD_DATA_SELECTION_KEYS)
  {
    result[key] = state[key] as never
  }
  return result
}

export const resetBoardData = (
  state: BoardSnapshot,
  paletteId: PaletteId
): BoardSnapshot =>
{
  const allItemIds = [
    ...state.tiers.flatMap((tier) => tier.itemIds),
    ...state.unrankedItemIds,
  ]

  return {
    ...extractBoardData(state),
    tiers: buildDefaultTiers(paletteId),
    unrankedItemIds: allItemIds,
  }
}

export const normalizeBoardSnapshot = (
  value: Partial<BoardSnapshot> | null | undefined,
  paletteId: PaletteId,
  fallbackTitle = DEFAULT_TITLE
): BoardSnapshot =>
{
  const ctx: NormalizationContext = {
    items: normalizeItemMap(value?.items),
    seenTierIds: new Set(),
    seenItemIds: new Set(),
  }
  const tiers = Array.isArray(value?.tiers)
    ? value.tiers.map((tier, index) =>
        normalizeTier(tier as RawTier, index, paletteId, ctx)
      )
    : buildDefaultTiers(paletteId)

  // unranked is normalized AFTER tiers so an item present in both lands in the
  // tier & is dropped from unranked (tier placement wins over orphan list)
  return {
    title: value?.title ?? fallbackTitle,
    tiers,
    unrankedItemIds: normalizeItemIds(value?.unrankedItemIds, ctx),
    items: ctx.items,
    deletedItems: normalizeItemList(value?.deletedItems),
    itemAspectRatio: normalizeBoardItemAspectRatio(value?.itemAspectRatio),
    itemAspectRatioMode: normalizeEnum(
      value?.itemAspectRatioMode,
      ASPECT_RATIO_MODES
    ),
    aspectRatioPromptDismissed:
      value?.aspectRatioPromptDismissed === true ? true : undefined,
    defaultItemImageFit: normalizeEnum(value?.defaultItemImageFit, IMAGE_FITS),
    defaultItemImagePadding: normalizeImagePadding(
      value?.defaultItemImagePadding
    ),
    paletteId: normalizeEnum(value?.paletteId, PALETTE_IDS),
    textStyleId: normalizeEnum(value?.textStyleId, TEXT_STYLE_IDS),
    pageBackground: isHexColor(value?.pageBackground)
      ? value.pageBackground
      : undefined,
    labels: normalizeBoardLabelSettings(value?.labels),
    autoPlate: normalizeBoardAutoPlate(value?.autoPlate),
    imageStyleId: asNonEmptyString(value?.imageStyleId),
    sourceTemplateId: asNonEmptyString(value?.sourceTemplateId),
    sourceRankingId: asNonEmptyString(value?.sourceRankingId),
    sourceTemplateTitle: asNonEmptyString(value?.sourceTemplateTitle),
    sourceRankingTitle: asNonEmptyString(value?.sourceRankingTitle),
    sourceTemplateCoverMedia: normalizeTemplateMediaRef(
      value?.sourceTemplateCoverMedia
    ),
    sourceTemplateCoverFraming: normalizeTemplateCoverFraming(
      value?.sourceTemplateCoverFraming
    ),
    preferredCriterionExternalId: asNonEmptyString(
      value?.preferredCriterionExternalId
    ),
  }
}
