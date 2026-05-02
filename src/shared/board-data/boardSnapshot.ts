// src/shared/board-data/boardSnapshot.ts
// board-data helpers — create, reset, extract, & normalize persisted boards

import {
  DEFAULT_TIER_IDS,
  DEFAULT_TIER_NAMES,
  DEFAULT_TITLE,
  buildDefaultTiers,
} from '~/shared/board-data/boardDefaults'
import type {
  BoardSnapshot,
  Tier,
  TierItem,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
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
import { isRecord } from '~/shared/lib/typeGuards'
import {
  ASPECT_RATIO_MODES,
  IMAGE_FITS,
  normalizeBoardLabelSettings,
  normalizeEnum,
  normalizeItemLabelOptions,
  normalizeItemTransform,
  normalizePositiveFinite,
} from '~/shared/board-data/boardNormalizers'
import { normalizeBoardItemAspectRatio } from '@tierlistbuilder/contracts/workspace/imageMath'

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

const normalizeImageRef = (raw: unknown): TierItemImageRef | undefined =>
{
  if (!isRecord(raw)) return undefined
  const hash = raw.hash
  if (typeof hash !== 'string' || hash.length === 0) return undefined
  return { hash }
}

// drop unknown fields & validate primitive shapes. items w/o a valid `id`
// are rejected
const normalizeTierItem = (raw: unknown): TierItem | null =>
{
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  const id = asItemId(raw.id)

  const imageRef = normalizeImageRef(raw.imageRef)
  const sourceImageRef = normalizeImageRef(raw.sourceImageRef)
  const aspectRatio = normalizePositiveFinite(raw.aspectRatio)
  const imageFit = normalizeEnum(raw.imageFit, IMAGE_FITS)
  const transform = normalizeItemTransform(raw.transform)
  const labelOptions = normalizeItemLabelOptions(raw.labelOptions)

  const item: TierItem = { id }
  if (imageRef) item.imageRef = imageRef
  if (sourceImageRef) item.sourceImageRef = sourceImageRef
  if (typeof raw.label === 'string') item.label = raw.label
  if (typeof raw.backgroundColor === 'string')
    item.backgroundColor = raw.backgroundColor
  if (typeof raw.altText === 'string') item.altText = raw.altText
  if (aspectRatio !== undefined) item.aspectRatio = aspectRatio
  if (imageFit !== undefined) item.imageFit = imageFit
  if (transform !== undefined) item.transform = transform
  if (labelOptions !== undefined) item.labelOptions = labelOptions
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
export const createNewTier = (
  paletteId: PaletteId,
  tierCount: number
): Tier => ({
  id: generateTierId(),
  name: `Tier ${tierCount + 1}`,
  colorSpec: getAutoTierColorSpec(paletteId, tierCount),
  itemIds: [],
})

type BoardSnapshotSource = BoardSnapshot

export type BoardDataSelection = Pick<BoardSnapshotSource, keyof BoardSnapshot>

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
  'paletteId',
  'textStyleId',
  'pageBackground',
  'labels',
] as const satisfies readonly (keyof BoardDataSelection)[]

export const selectBoardDataFields = (
  state: BoardSnapshotSource
): BoardDataSelection => ({
  title: state.title,
  tiers: state.tiers,
  unrankedItemIds: state.unrankedItemIds,
  items: state.items,
  deletedItems: state.deletedItems,
  itemAspectRatio: state.itemAspectRatio,
  itemAspectRatioMode: state.itemAspectRatioMode,
  aspectRatioPromptDismissed: state.aspectRatioPromptDismissed,
  defaultItemImageFit: state.defaultItemImageFit,
  paletteId: state.paletteId,
  textStyleId: state.textStyleId,
  pageBackground: state.pageBackground,
  labels: state.labels,
})

export const boardDataFieldsEqual = (
  a: BoardDataSelection,
  b: BoardDataSelection
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

export const extractBoardData = (
  state: BoardSnapshotSource
): BoardSnapshot => ({
  title: state.title,
  tiers: state.tiers,
  unrankedItemIds: state.unrankedItemIds,
  items: state.items,
  deletedItems: state.deletedItems,
  itemAspectRatio: state.itemAspectRatio,
  itemAspectRatioMode: state.itemAspectRatioMode,
  aspectRatioPromptDismissed: state.aspectRatioPromptDismissed,
  defaultItemImageFit: state.defaultItemImageFit,
  paletteId: state.paletteId,
  textStyleId: state.textStyleId,
  pageBackground: state.pageBackground,
  labels: state.labels,
})

export const resetBoardData = (
  state: BoardSnapshotSource,
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
    paletteId: normalizeEnum(value?.paletteId, PALETTE_IDS),
    textStyleId: normalizeEnum(value?.textStyleId, TEXT_STYLE_IDS),
    pageBackground: isHexColor(value?.pageBackground)
      ? value.pageBackground
      : undefined,
    labels: normalizeBoardLabelSettings(value?.labels),
  }
}
