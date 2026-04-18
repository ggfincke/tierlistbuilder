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
import { getBlobsBatch } from '~/shared/images/imageStore'
import { isRecord } from '~/shared/lib/typeGuards'

const IMAGE_EXPORT_CONCURRENCY = 4

export { collectSnapshotImageHashes }

const cloneWireItem = (item: TierItemWire): TierItem =>
{
  const { imageUrl, ...rest } = item
  return imageUrl ? { ...rest, imageUrl } : rest
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

const toSnapshotItems = (
  items: Partial<BoardSnapshotWire['items']> | undefined
): BoardSnapshot['items'] =>
{
  if (!items || typeof items !== 'object')
  {
    return {}
  }

  return Object.fromEntries(
    Object.entries(items)
      .filter((entry): entry is [string, TierItemWire] =>
        isTierItemWire(entry[1])
      )
      .map(([id, item]) => [id, cloneWireItem(item)])
  ) as BoardSnapshot['items']
}

const toSnapshotDeletedItems = (
  items: Partial<BoardSnapshotWire['deletedItems']> | undefined
): BoardSnapshot['deletedItems'] =>
{
  if (!Array.isArray(items))
  {
    return []
  }

  return items.filter(isTierItemWire).map((item) => cloneWireItem(item))
}

const itemToWire = async (
  item: TierItem,
  blobsByHash: ReadonlyMap<string, Blob | null>,
  dataUrlsByHash: Map<string, Promise<string>>
): Promise<TierItemWire> =>
{
  const { imageRef, imageUrl: inlineImageUrl, ...rest } = item

  if (!imageRef)
  {
    return inlineImageUrl ? { ...rest, imageUrl: inlineImageUrl } : rest
  }

  const imageUrl = await getBlobDataUrl(
    imageRef.hash,
    blobsByHash,
    dataUrlsByHash
  )
  if (imageUrl)
  {
    return {
      ...rest,
      imageUrl,
    }
  }

  return inlineImageUrl ? { ...rest, imageUrl: inlineImageUrl } : rest
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

// convert wire-format data back into an in-memory snapshot shape
export const wireToSnapshot = (
  wire: Partial<BoardSnapshotWire>,
  fallbackTitle = ''
): BoardSnapshot => ({
  title: typeof wire.title === 'string' ? wire.title : fallbackTitle,
  tiers: Array.isArray(wire.tiers) ? wire.tiers : [],
  unrankedItemIds: Array.isArray(wire.unrankedItemIds)
    ? wire.unrankedItemIds
    : [],
  items: toSnapshotItems(wire.items),
  deletedItems: toSnapshotDeletedItems(wire.deletedItems),
})
