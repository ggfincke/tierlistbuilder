// src/features/workspace/boards/model/boardSnapshot.ts
// board-data helpers — create, reset, extract, & normalize persisted boards

import {
  DEFAULT_TIER_IDS,
  DEFAULT_TIER_NAMES,
  DEFAULT_TITLE,
  buildDefaultTiers,
} from '~/features/workspace/boards/lib/boardDefaults'
import type {
  BoardSnapshot,
  ImageFit,
  ItemAspectRatioMode,
  ItemRotation,
  ItemTransform,
  Tier,
  TierItem,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  asItemId,
  generateTierId,
  isTierId,
  type ItemId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import {
  getAutoTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '~/shared/theme/tierColors'
import type { ActiveBoardRuntimeState } from './runtime'

interface RawTier
{
  id?: unknown
  name?: unknown
  description?: unknown
  colorSpec?: unknown
  rowColorSpec?: unknown
  itemIds?: unknown
}

// filter out non-string entries from a raw itemIds array & brand the rest
const normalizeItemIds = (raw: unknown): ItemId[] =>
{
  if (!Array.isArray(raw))
  {
    return []
  }

  const result: ItemId[] = []
  for (const value of raw)
  {
    if (typeof value === 'string')
    {
      result.push(asItemId(value))
    }
  }
  return result
}

const normalizePositiveFinite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined

const normalizeEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined)

const ASPECT_RATIO_MODES: readonly ItemAspectRatioMode[] = ['auto', 'manual']
const IMAGE_FITS: readonly ImageFit[] = ['cover', 'contain']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeImageRef = (raw: unknown): TierItemImageRef | undefined =>
{
  if (!isRecord(raw)) return undefined
  const hash = raw.hash
  if (typeof hash !== 'string' || hash.length === 0) return undefined
  const cloudMediaExternalId = raw.cloudMediaExternalId
  return typeof cloudMediaExternalId === 'string' &&
    cloudMediaExternalId.length > 0
    ? { hash, cloudMediaExternalId }
    : { hash }
}

const ROTATION_VALUES: readonly ItemRotation[] = [0, 90, 180, 270]

const clampFiniteNumber = (
  value: unknown,
  min: number,
  max: number
): number | null =>
{
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < min) return min
  if (value > max) return max
  return value
}

// validate & clamp untrusted transform input. returns undefined for missing
// or malformed payloads so import + cloud-pull roundtrip a "no manual edit"
// item w/o manufacturing a phantom transform that defeats the imageFit path
const normalizeItemTransform = (raw: unknown): ItemTransform | undefined =>
{
  if (!isRecord(raw)) return undefined
  const rotation = raw.rotation
  if (
    typeof rotation !== 'number' ||
    !ROTATION_VALUES.includes(rotation as ItemRotation)
  )
  {
    return undefined
  }
  const zoom = clampFiniteNumber(
    raw.zoom,
    ITEM_TRANSFORM_LIMITS.zoomMin,
    ITEM_TRANSFORM_LIMITS.zoomMax
  )
  if (zoom === null) return undefined
  const offsetX = clampFiniteNumber(
    raw.offsetX,
    ITEM_TRANSFORM_LIMITS.offsetMin,
    ITEM_TRANSFORM_LIMITS.offsetMax
  )
  if (offsetX === null) return undefined
  const offsetY = clampFiniteNumber(
    raw.offsetY,
    ITEM_TRANSFORM_LIMITS.offsetMin,
    ITEM_TRANSFORM_LIMITS.offsetMax
  )
  if (offsetY === null) return undefined
  const normalized = {
    rotation: rotation as ItemRotation,
    zoom,
    offsetX,
    offsetY,
  }
  return normalized.rotation === ITEM_TRANSFORM_IDENTITY.rotation &&
    normalized.zoom === ITEM_TRANSFORM_IDENTITY.zoom &&
    normalized.offsetX === ITEM_TRANSFORM_IDENTITY.offsetX &&
    normalized.offsetY === ITEM_TRANSFORM_IDENTITY.offsetY
    ? undefined
    : normalized
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
  paletteId: PaletteId
): Tier =>
{
  const rowColorSpec = normalizeCanonicalTierColorSpec(tier.rowColorSpec)

  const normalized: Tier = {
    id:
      typeof tier.id === 'string' && isTierId(tier.id)
        ? tier.id
        : (DEFAULT_TIER_IDS[index] ?? generateTierId()),
    name:
      typeof tier.name === 'string'
        ? tier.name
        : (DEFAULT_TIER_NAMES[index] ?? `Tier ${index + 1}`),
    description:
      typeof tier.description === 'string' ? tier.description : undefined,
    colorSpec:
      normalizeCanonicalTierColorSpec(tier.colorSpec) ??
      getAutoTierColorSpec(paletteId, index),
    itemIds: normalizeItemIds(tier.itemIds),
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

type BoardSnapshotSource = Pick<ActiveBoardRuntimeState, keyof BoardSnapshot>

// tuple mirrors every BoardSnapshot field so the autosave subscriber
// re-fires when any persisted field changes, including aspect-ratio state
export type BoardDataSelection = [
  BoardSnapshotSource['title'],
  BoardSnapshotSource['tiers'],
  BoardSnapshotSource['unrankedItemIds'],
  BoardSnapshotSource['items'],
  BoardSnapshotSource['deletedItems'],
  BoardSnapshotSource['itemAspectRatio'],
  BoardSnapshotSource['itemAspectRatioMode'],
  BoardSnapshotSource['aspectRatioPromptDismissed'],
  BoardSnapshotSource['defaultItemImageFit'],
]

export const selectBoardDataFields = (
  state: BoardSnapshotSource
): BoardDataSelection => [
  state.title,
  state.tiers,
  state.unrankedItemIds,
  state.items,
  state.deletedItems,
  state.itemAspectRatio,
  state.itemAspectRatioMode,
  state.aspectRatioPromptDismissed,
  state.defaultItemImageFit,
]

export const boardDataFieldsEqual = (
  a: BoardDataSelection,
  b: BoardDataSelection
): boolean =>
{
  for (let i = 0; i < a.length; i++)
  {
    if (a[i] !== b[i])
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
  const tiers = Array.isArray(value?.tiers)
    ? value.tiers.map((tier, index) =>
        normalizeTier(tier as RawTier, index, paletteId)
      )
    : buildDefaultTiers(paletteId)

  return {
    title: value?.title ?? fallbackTitle,
    tiers,
    unrankedItemIds: normalizeItemIds(value?.unrankedItemIds),
    items: normalizeItemMap(value?.items),
    deletedItems: normalizeItemList(value?.deletedItems),
    itemAspectRatio: normalizePositiveFinite(value?.itemAspectRatio),
    itemAspectRatioMode: normalizeEnum(
      value?.itemAspectRatioMode,
      ASPECT_RATIO_MODES
    ),
    aspectRatioPromptDismissed:
      value?.aspectRatioPromptDismissed === true ? true : undefined,
    defaultItemImageFit: normalizeEnum(value?.defaultItemImageFit, IMAGE_FITS),
  }
}
