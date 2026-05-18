// src/shared/board-data/boardWireMapper.ts
// BoardSnapshot <-> JSON wire shape for export, import, & share helpers

import type {
  BoardSnapshot,
  BoardSnapshotWire,
  TierItem,
  TierItemImageRef,
  TierItemWire,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  PALETTE_IDS,
  TEXT_STYLE_IDS,
} from '@tierlistbuilder/contracts/lib/theme'
import { isHexColor } from '@tierlistbuilder/contracts/lib/hexColor'
import { normalizeBoardItemAspectRatio } from '@tierlistbuilder/contracts/workspace/imageMath'
import { blobToDataUrl } from '~/shared/lib/binaryCodec'
import {
  collectSnapshotExportImageHashes,
  transformSnapshotItemsAsync,
} from '~/shared/lib/boardSnapshotItems'
import { getImageRefsByRendition } from '~/shared/lib/imageRefs'
import {
  BLOB_PREPARE_CONCURRENCY,
  persistPreparedBlobRecords,
  prepareDataUrlRecord,
  type PreparedBlobRecord,
} from '~/shared/images/imagePersistence'
import { getBlobsBatch, probeImageStore } from '~/shared/images/imageStore'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { decodeImageAspectRatioFromBlob } from '~/shared/images/imageLoad'
import { isOptionalString, isRecord } from '~/shared/lib/typeGuards'
import {
  ASPECT_RATIO_MODES,
  IMAGE_FITS,
  normalizeBoardLabelSettings,
  normalizeEnum,
  normalizeItemLabelOptions,
  normalizeItemTransform,
  normalizePositiveFinite,
} from '~/shared/board-data/boardNormalizers'

const IMAGE_EXPORT_CONCURRENCY = 4

const isTierItemImageRef = (value: unknown): value is TierItemImageRef =>
{
  return isRecord(value) && typeof value.hash === 'string'
}

const OPTIONAL_STRING_WIRE_FIELDS = [
  'imageUrl',
  'label',
  'backgroundColor',
  'altText',
  'notes',
  'sourceTemplateItemExternalId',
] as const satisfies readonly (keyof TierItemWire)[]

const isTierItemWire = (value: unknown): value is TierItemWire =>
{
  if (!isRecord(value) || typeof value.id !== 'string') return false
  return OPTIONAL_STRING_WIRE_FIELDS.every((field) =>
    isOptionalString(value[field])
  )
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
  const {
    imageRef: _imageRef,
    tileImageRef: _tileImageRef,
    sourceImageRef: _sourceImageRef,
    ...rest
  } = item

  // editor priority maximizes export fidelity: source -> tile -> preview
  const exportImageRefs = getImageRefsByRendition(item, 'editor')
  if (exportImageRefs.length === 0) return rest

  for (const ref of exportImageRefs)
  {
    const inlineImageUrl = await getBlobDataUrl(
      ref.hash,
      blobsByHash,
      dataUrlsByHash
    )
    if (inlineImageUrl) return { ...rest, imageUrl: inlineImageUrl }
  }

  throw new Error(
    `Missing image bytes for item "${item.id}". Wait for images to finish loading, then try exporting again.`
  )
}

// convert a snapshot to wire shape using a preloaded hash -> Blob map.
// every non-item field passes through verbatim (snapshot & wire only differ on
// item shape), so spread + override keeps the field list in one place
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
    ...snapshot,
    items: items as BoardSnapshotWire['items'],
    deletedItems,
  }
}

// convert one snapshot to wire shape by loading export candidate blobs first.
// itemToWire prefers source bytes, then falls back to tile or preview bytes
export const snapshotToWire = async (
  snapshot: BoardSnapshot
): Promise<BoardSnapshotWire> =>
{
  const hashes = collectSnapshotExportImageHashes(snapshot)
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
        const record = await prepareDataUrlRecord(dataUrl)
        const aspectRatio = await decodeImageAspectRatioFromBlob(record.blob)
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

const wireItemToSnapshotItem = (
  item: TierItemWire,
  prepared: PreparedWireImage | undefined
): TierItem =>
{
  const {
    id,
    imageUrl,
    label,
    backgroundColor,
    altText,
    notes,
    sourceTemplateItemExternalId,
  } = item
  // prefer the wire's captured aspect ratio; fall back to the ratio decoded
  // during persist so items without an explicit wire field still render right
  const aspectRatio =
    normalizePositiveFinite(item.aspectRatio) ?? prepared?.aspectRatio
  const imageFit = normalizeEnum(item.imageFit, IMAGE_FITS)
  const transform = normalizeItemTransform(item.transform)
  const labelOptions = normalizeItemLabelOptions(item.labelOptions)
  const base: TierItem = {
    id,
    label,
    backgroundColor,
    altText,
    notes,
    aspectRatio,
    imageFit,
    ...(transform ? { transform } : {}),
    ...(labelOptions ? { labelOptions } : {}),
    ...(sourceTemplateItemExternalId ? { sourceTemplateItemExternalId } : {}),
  }

  if (prepared)
  {
    // the inline blob (whichever rendition the exporter picked) always restores
    // as `imageRef`; tile/source refs stay absent so the editor & auto-crop
    // priority chains rebuild the higher-quality renditions on next edit
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

  // spread first for the source-template & criterion passthroughs; the
  // downstream normalizeBoardSnapshot pass re-validates them at the JSON-import
  // boundary, so untrusted strings can't reach the store
  return {
    ...wire,
    title: typeof wire.title === 'string' ? wire.title : fallbackTitle,
    tiers: Array.isArray(wire.tiers) ? wire.tiers : [],
    unrankedItemIds: Array.isArray(wire.unrankedItemIds)
      ? wire.unrankedItemIds
      : [],
    items,
    deletedItems,
    itemAspectRatio: normalizeBoardItemAspectRatio(wire.itemAspectRatio),
    itemAspectRatioMode: normalizeEnum(
      wire.itemAspectRatioMode,
      ASPECT_RATIO_MODES
    ),
    aspectRatioPromptDismissed:
      wire.aspectRatioPromptDismissed === true ? true : undefined,
    defaultItemImageFit: normalizeEnum(wire.defaultItemImageFit, IMAGE_FITS),
    paletteId: normalizeEnum(wire.paletteId, PALETTE_IDS),
    textStyleId: normalizeEnum(wire.textStyleId, TEXT_STYLE_IDS),
    pageBackground: isHexColor(wire.pageBackground)
      ? wire.pageBackground
      : undefined,
    labels: normalizeBoardLabelSettings(wire.labels),
  }
}

export const itemUsesLocalImageRef = (value: unknown): boolean =>
{
  if (!isRecord(value)) return false

  const hasLocalRef =
    isTierItemImageRef(value.imageRef) ||
    isTierItemImageRef(value.tileImageRef) ||
    isTierItemImageRef(value.sourceImageRef)
  if (!hasLocalRef) return false

  return typeof value.imageUrl !== 'string' || value.imageUrl.length === 0
}
