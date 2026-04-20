// src/features/workspace/export/lib/boardWireMapper.ts
// BoardSnapshot <-> JSON wire shape for export, import, & share helpers

import type {
  BoardSnapshot,
  BoardSnapshotWire,
  TierItem,
  TierItemWire,
} from '@tierlistbuilder/contracts/workspace/board'
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
import { isRecord } from '~/shared/lib/typeGuards'

const IMAGE_EXPORT_CONCURRENCY = 4

export { collectSnapshotImageHashes }

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
  const { imageRef, ...rest } = item

  if (!imageRef)
  {
    return rest
  }

  const imageUrl = await getBlobDataUrl(
    imageRef.hash,
    blobsByHash,
    dataUrlsByHash
  )
  return imageUrl ? { ...rest, imageUrl } : rest
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

// hash inline wire imageUrls in parallel, persist all bytes in one IDB batch,
// & return a Map keyed by wire item id so callers can swap imageUrl -> imageRef.
// unparseable data URLs drop; IDB failures fall back to keeping imageUrl inline
const prepareInlineWireImages = async (
  wireItems: readonly (readonly [string, TierItemWire])[]
): Promise<Map<string, PreparedBlobRecord>> =>
{
  const byId = new Map<string, PreparedBlobRecord>()

  const candidates = wireItems.filter(
    ([, item]) => typeof item.imageUrl === 'string' && item.imageUrl.length > 0
  )

  if (candidates.length === 0 || !(await probeImageStore()))
  {
    return byId
  }

  const prepared = await mapAsyncLimit(
    candidates,
    BLOB_PREPARE_CONCURRENCY,
    async ([id, item]) =>
    {
      try
      {
        const record = await prepareDataUrlRecord(item.imageUrl!)
        return [id, record] as const
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
    records.push(entry[1])
  }

  try
  {
    await persistPreparedBlobRecords(records)
  }
  catch
  {
    return new Map()
  }
  return byId
}

const wireItemToSnapshotItem = (
  item: TierItemWire,
  prepared: PreparedBlobRecord | undefined
): TierItem =>
{
  const { id, imageUrl, label, backgroundColor, altText } = item
  const base: TierItem = { id, label, backgroundColor, altText }

  if (prepared)
  {
    return { ...base, imageRef: prepared.imageRef }
  }

  return imageUrl ? { ...base, imageUrl } : base
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
  }
}
