// src/features/workspace/export/lib/boardWireMapper.ts
// BoardSnapshot <-> JSON wire shape for export, import, & share helpers

import type {
  BoardLabelSettings,
  BoardSnapshot,
  BoardSnapshotWire,
  ItemLabelOptions,
  ItemRotation,
  ItemTransform,
  LabelPlacement,
  LabelScrim,
  LabelSizeScale,
  LabelTextColor,
  TierItem,
  TierItemImageRef,
  TierItemWire,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
  LABEL_SCRIMS,
  LABEL_SIZE_SCALES,
  LABEL_TEXT_COLORS,
  normalizeLabelFontSizePx,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  PALETTE_IDS,
  TEXT_STYLE_IDS,
} from '@tierlistbuilder/contracts/lib/theme'
import { isHexColor } from '@tierlistbuilder/contracts/lib/hexColor'
import { blobToDataUrl } from '~/shared/lib/binaryCodec'
import {
  collectSnapshotImageHashes,
  transformSnapshotItemsAsync,
} from '~/shared/lib/boardSnapshotItems'
import {
  BLOB_PREPARE_CONCURRENCY,
  persistPreparedBlobRecords,
  prepareDataUrlRecord,
  type PreparedBlobRecord,
} from '~/shared/images/imagePersistence'
import { getBlobsBatch, probeImageStore } from '~/shared/images/imageStore'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { decodeImageAspectRatioFromSrc } from '~/features/workspace/settings/lib/imageLoad'
import { isRecord } from '~/shared/lib/typeGuards'

const IMAGE_EXPORT_CONCURRENCY = 4

export { collectSnapshotImageHashes }

const isTierItemImageRef = (value: unknown): value is TierItemImageRef =>
{
  if (!isRecord(value) || typeof value.hash !== 'string')
  {
    return false
  }

  return (
    value.cloudMediaExternalId === undefined ||
    typeof value.cloudMediaExternalId === 'string'
  )
}

const isTierItemWire = (value: unknown): value is TierItemWire =>
{
  if (!isRecord(value) || typeof value.id !== 'string')
  {
    return false
  }

  if (value.imageUrl !== undefined && typeof value.imageUrl !== 'string')
  {
    return false
  }

  if (value.label !== undefined && typeof value.label !== 'string')
  {
    return false
  }

  if (
    value.backgroundColor !== undefined &&
    typeof value.backgroundColor !== 'string'
  )
  {
    return false
  }

  return value.altText === undefined || typeof value.altText === 'string'
}

const getBlobDataUrl = async (
  hash: string,
  blobsByHash: ReadonlyMap<string, Blob | null>,
  dataUrlsByHash: Map<string, Promise<string>>
): Promise<string | null> =>
{
  const existing = dataUrlsByHash.get(hash)
  if (existing)
  {
    return existing
  }

  const blob = blobsByHash.get(hash) ?? null
  if (!blob)
  {
    return null
  }

  const pending = blobToDataUrl(blob)
  dataUrlsByHash.set(hash, pending)
  return pending
}

const itemToWire = async (
  item: TierItem,
  blobsByHash: ReadonlyMap<string, Blob | null>,
  dataUrlsByHash: Map<string, Promise<string>>
): Promise<TierItemWire> =>
{
  const { imageRef, sourceImageRef: _sourceImageRef, ...rest } = item

  if (!imageRef)
  {
    return rest
  }

  const inlineImageUrl = await getBlobDataUrl(
    imageRef.hash,
    blobsByHash,
    dataUrlsByHash
  )

  if (!inlineImageUrl)
  {
    throw new Error(
      `Missing image bytes for item "${item.id}". Wait for images to finish loading, then try exporting again.`
    )
  }

  return { ...rest, imageUrl: inlineImageUrl }
}

// validate untrusted placement payloads from the wire (import / share-link).
// unknown modes & out-of-range coordinates collapse to undefined so corrupt
// snapshots fall back to the renderer's default placement
const normalizeLabelPlacementWire = (
  raw: unknown
): LabelPlacement | undefined =>
{
  if (typeof raw !== 'object' || raw === null) return undefined
  const obj = raw as Record<string, unknown>
  const mode = obj.mode
  if (mode === 'overlay')
  {
    const x = clampFiniteWire(obj.x, 0, 1)
    const y = clampFiniteWire(obj.y, 0, 1)
    if (x === null || y === null) return undefined
    return { mode: 'overlay', x, y }
  }
  if (mode === 'captionAbove') return { mode: 'captionAbove' }
  if (mode === 'captionBelow') return { mode: 'captionBelow' }
  return undefined
}

// strip unknown fields & coerce primitive shapes; returns undefined when
// every field is missing so the field doesn't get serialized as `{}`
const normalizeItemLabelOptionsWire = (
  raw: unknown
): ItemLabelOptions | undefined =>
{
  if (typeof raw !== 'object' || raw === null) return undefined
  const obj = raw as Record<string, unknown>
  const result: ItemLabelOptions = {}
  if (typeof obj.visible === 'boolean') result.visible = obj.visible
  const placement = normalizeLabelPlacementWire(obj.placement)
  if (placement) result.placement = placement
  const scrim = normalizeEnumWire<LabelScrim>(obj.scrim, LABEL_SCRIMS)
  if (scrim) result.scrim = scrim
  const sizeScale = normalizeEnumWire<LabelSizeScale>(
    obj.sizeScale,
    LABEL_SIZE_SCALES
  )
  if (sizeScale) result.sizeScale = sizeScale
  const fontSizePx = normalizeLabelFontSizePx(obj.fontSizePx)
  if (fontSizePx !== undefined) result.fontSizePx = fontSizePx
  const textStyleId = normalizeEnumWire(obj.textStyleId, TEXT_STYLE_IDS)
  if (textStyleId) result.textStyleId = textStyleId
  const textColor = normalizeEnumWire<LabelTextColor>(
    obj.textColor,
    LABEL_TEXT_COLORS
  )
  if (textColor) result.textColor = textColor
  return Object.keys(result).length > 0 ? result : undefined
}

const normalizeBoardLabelSettingsWire = (
  raw: unknown
): BoardLabelSettings | undefined =>
{
  if (typeof raw !== 'object' || raw === null) return undefined
  const obj = raw as Record<string, unknown>
  const result: BoardLabelSettings = {}
  if (typeof obj.show === 'boolean') result.show = obj.show
  const placement = normalizeLabelPlacementWire(obj.placement)
  if (placement) result.placement = placement
  const scrim = normalizeEnumWire<LabelScrim>(obj.scrim, LABEL_SCRIMS)
  if (scrim) result.scrim = scrim
  const sizeScale = normalizeEnumWire<LabelSizeScale>(
    obj.sizeScale,
    LABEL_SIZE_SCALES
  )
  if (sizeScale) result.sizeScale = sizeScale
  const fontSizePx = normalizeLabelFontSizePx(obj.fontSizePx)
  if (fontSizePx !== undefined) result.fontSizePx = fontSizePx
  const textStyleId = normalizeEnumWire(obj.textStyleId, TEXT_STYLE_IDS)
  if (textStyleId) result.textStyleId = textStyleId
  const textColor = normalizeEnumWire<LabelTextColor>(
    obj.textColor,
    LABEL_TEXT_COLORS
  )
  if (textColor && textColor !== 'auto') result.textColor = textColor
  return Object.keys(result).length > 0 ? result : undefined
}

// convert a snapshot to wire shape using a preloaded hash -> Blob map
export const snapshotToWireWithBlobs = async (
  snapshot: BoardSnapshot,
  blobsByHash: ReadonlyMap<string, Blob | null>
): Promise<BoardSnapshotWire> =>
{
  const dataUrlsByHash = new Map<string, Promise<string>>()

  const { items, deletedItems } =
    await transformSnapshotItemsAsync<TierItemWire>(
      snapshot,
      IMAGE_EXPORT_CONCURRENCY,
      (item) => itemToWire(item, blobsByHash, dataUrlsByHash)
    )

  return {
    title: snapshot.title,
    tiers: snapshot.tiers,
    unrankedItemIds: snapshot.unrankedItemIds,
    items: items as BoardSnapshotWire['items'],
    deletedItems,
    itemAspectRatio: snapshot.itemAspectRatio,
    itemAspectRatioMode: snapshot.itemAspectRatioMode,
    aspectRatioPromptDismissed: snapshot.aspectRatioPromptDismissed,
    defaultItemImageFit: snapshot.defaultItemImageFit,
    paletteId: snapshot.paletteId,
    textStyleId: snapshot.textStyleId,
    pageBackground: snapshot.pageBackground,
    labels: snapshot.labels,
  }
}

// convert one snapshot to wire shape by loading any referenced blobs first
export const snapshotToWire = async (
  snapshot: BoardSnapshot
): Promise<BoardSnapshotWire> =>
{
  const hashes = collectSnapshotImageHashes(snapshot)
  const records = await getBlobsBatch(hashes)
  const blobsByHash = new Map<string, Blob | null>()

  for (const hash of hashes)
  {
    blobsByHash.set(hash, records.get(hash)?.bytes ?? null)
  }

  return snapshotToWireWithBlobs(snapshot, blobsByHash)
}

interface PreparedWireImage
{
  record: PreparedBlobRecord
  // dimensions decoded from the inline data URL so imported items land w/
  // an aspectRatio even when the wire payload didn't carry one
  aspectRatio: number | undefined
}

// hash + decode inline wire imageUrls, persist bytes in one IDB batch, & return
// a Map keyed by wire item id. throws if IDB is unavailable or the write fails
const prepareInlineWireImages = async (
  wireItems: readonly (readonly [string, TierItemWire])[]
): Promise<Map<string, PreparedWireImage>> =>
{
  const byId = new Map<string, PreparedWireImage>()

  const candidates = wireItems.filter(
    ([, item]) => typeof item.imageUrl === 'string' && item.imageUrl.length > 0
  )

  if (candidates.length === 0)
  {
    return byId
  }

  if (!(await probeImageStore()))
  {
    throw new Error(
      'Image storage is unavailable in this browser — inline import is not supported.'
    )
  }

  const prepared = await mapAsyncLimit(
    candidates,
    BLOB_PREPARE_CONCURRENCY,
    async ([id, item]) =>
    {
      try
      {
        const dataUrl = item.imageUrl!
        const [record, aspectRatio] = await Promise.all([
          prepareDataUrlRecord(dataUrl),
          decodeImageAspectRatioFromSrc(dataUrl),
        ])
        return [id, { record, aspectRatio: aspectRatio ?? undefined }] as const
      }
      catch
      {
        return null
      }
    }
  )

  const records: PreparedBlobRecord[] = []
  for (const entry of prepared)
  {
    if (!entry) continue
    byId.set(entry[0], entry[1])
    records.push(entry[1].record)
  }

  await persistPreparedBlobRecords(records)
  return byId
}

const ASPECT_RATIO_MODES = ['auto', 'manual'] as const
const IMAGE_FITS = ['cover', 'contain'] as const
const ROTATION_VALUES: readonly ItemRotation[] = [0, 90, 180, 270]

const normalizePositiveFiniteWire = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined

const normalizeEnumWire = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined)

const clampFiniteWire = (
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

// duplicated alongside boardSnapshot's normalizer because share-link/import
// rides this wire path before the snapshot normalizer ever runs. keeping both
// in sync is enforced by ITEM_TRANSFORM_LIMITS being a single source of truth
const normalizeItemTransformWire = (
  raw: unknown
): ItemTransform | undefined =>
{
  if (typeof raw !== 'object' || raw === null) return undefined
  const obj = raw as Record<string, unknown>
  const rotation = obj.rotation
  if (
    typeof rotation !== 'number' ||
    !ROTATION_VALUES.includes(rotation as ItemRotation)
  )
  {
    return undefined
  }
  const zoom = clampFiniteWire(
    obj.zoom,
    ITEM_TRANSFORM_LIMITS.zoomMin,
    ITEM_TRANSFORM_LIMITS.zoomMax
  )
  if (zoom === null) return undefined
  const offsetX = clampFiniteWire(
    obj.offsetX,
    ITEM_TRANSFORM_LIMITS.offsetMin,
    ITEM_TRANSFORM_LIMITS.offsetMax
  )
  if (offsetX === null) return undefined
  const offsetY = clampFiniteWire(
    obj.offsetY,
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

const wireItemToSnapshotItem = (
  item: TierItemWire,
  prepared: PreparedWireImage | undefined
): TierItem =>
{
  const { id, imageUrl, label, backgroundColor, altText } = item
  // prefer the wire's captured aspect ratio; fall back to the ratio decoded
  // during persist so items without an explicit wire field still render right
  const aspectRatio =
    normalizePositiveFiniteWire(item.aspectRatio) ?? prepared?.aspectRatio
  const imageFit = normalizeEnumWire(item.imageFit, IMAGE_FITS)
  const transform = normalizeItemTransformWire(item.transform)
  const labelOptions = normalizeItemLabelOptionsWire(item.labelOptions)
  const base: TierItem = {
    id,
    label,
    backgroundColor,
    altText,
    aspectRatio,
    imageFit,
    ...(transform ? { transform } : {}),
    ...(labelOptions ? { labelOptions } : {}),
  }

  if (prepared)
  {
    return { ...base, imageRef: prepared.record.imageRef }
  }

  // wire carried inline bytes but IDB persist failed — fail the whole import
  // loudly instead of silently dropping the image or leaving it text-only
  if (typeof imageUrl === 'string' && imageUrl.length > 0)
  {
    throw new Error(
      `Failed to persist image bytes for item "${id}". Image storage may be unavailable in this browser.`
    )
  }

  return base
}

// convert wire-format data back into an in-memory snapshot shape. async
// because inline imageUrls are hashed & persisted to IDB before the snapshot
// is built when possible; otherwise the inline bytes stay on the item
export const wireToSnapshot = async (
  wire: Partial<BoardSnapshotWire>,
  fallbackTitle = ''
): Promise<BoardSnapshot> =>
{
  const liveEntries: [string, TierItemWire][] = []
  const liveItems =
    wire.items && typeof wire.items === 'object' ? wire.items : {}

  for (const [id, raw] of Object.entries(liveItems))
  {
    if (isTierItemWire(raw))
    {
      liveEntries.push([id, raw])
    }
  }

  const deletedRaw = Array.isArray(wire.deletedItems) ? wire.deletedItems : []
  const deletedEntries: [string, TierItemWire][] = deletedRaw
    .filter(isTierItemWire)
    .map((item, index) => [`__deleted-${index}`, item])

  const preparedById = await prepareInlineWireImages([
    ...liveEntries,
    ...deletedEntries,
  ])

  const items: BoardSnapshot['items'] = Object.fromEntries(
    liveEntries.map(([id, item]) => [
      id,
      wireItemToSnapshotItem(item, preparedById.get(id)),
    ])
  ) as BoardSnapshot['items']

  const deletedItems: BoardSnapshot['deletedItems'] = deletedEntries.map(
    ([key, item]) => wireItemToSnapshotItem(item, preparedById.get(key))
  )

  return {
    title: typeof wire.title === 'string' ? wire.title : fallbackTitle,
    tiers: Array.isArray(wire.tiers) ? wire.tiers : [],
    unrankedItemIds: Array.isArray(wire.unrankedItemIds)
      ? wire.unrankedItemIds
      : [],
    items,
    deletedItems,
    itemAspectRatio: normalizePositiveFiniteWire(wire.itemAspectRatio),
    itemAspectRatioMode: normalizeEnumWire(
      wire.itemAspectRatioMode,
      ASPECT_RATIO_MODES
    ),
    aspectRatioPromptDismissed:
      wire.aspectRatioPromptDismissed === true ? true : undefined,
    defaultItemImageFit: normalizeEnumWire(
      wire.defaultItemImageFit,
      IMAGE_FITS
    ),
    paletteId: normalizeEnumWire(wire.paletteId, PALETTE_IDS),
    textStyleId: normalizeEnumWire(wire.textStyleId, TEXT_STYLE_IDS),
    pageBackground: isHexColor(wire.pageBackground)
      ? wire.pageBackground
      : undefined,
    labels: normalizeBoardLabelSettingsWire(wire.labels),
  }
}

export const itemUsesLocalImageRef = (value: unknown): boolean =>
{
  if (!isRecord(value))
  {
    return false
  }

  if (!isTierItemImageRef(value.imageRef))
  {
    return false
  }

  return typeof value.imageUrl !== 'string' || value.imageUrl.length === 0
}
