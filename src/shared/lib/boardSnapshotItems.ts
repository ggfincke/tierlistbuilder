// src/shared/lib/boardSnapshotItems.ts
// board snapshot item traversal helpers shared by image, export, & share code

import type {
  BoardSnapshot,
  TierItem,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import { asItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { isPresent } from '~/shared/lib/typeGuards'
import {
  getImageRefsByRendition,
  getPrimaryImageRef,
} from '~/shared/lib/imageRefs'
import { isIdentityTransform } from './imageTransform'

const itemHasRenderTransform = (item: TierItem): boolean =>
{
  const transform = item.transform
  return !!transform && !isIdentityTransform(transform)
}

// visit every live & deleted snapshot item in stable order
export const forEachSnapshotItem = (
  snapshot: BoardSnapshot,
  visit: (item: TierItem, id: ItemId | null) => void
): void =>
{
  for (const [id, item] of Object.entries(snapshot.items))
  {
    visit(item, asItemId(id))
  }

  for (const item of snapshot.deletedItems)
  {
    visit(item, null)
  }
}

// collect derived values while traversing every snapshot item once
const collectSnapshotItems = <T>(
  snapshot: BoardSnapshot,
  collect: (item: TierItem, id: ItemId | null) => T | null | undefined
): T[] =>
{
  const results: T[] = []

  forEachSnapshotItem(snapshot, (item, id) =>
  {
    const value = collect(item, id)
    if (isPresent(value))
    {
      results.push(value)
    }
  })

  return results
}

// collect unique image hashes referenced anywhere on a snapshot
export const collectSnapshotImageHashes = (
  snapshot: BoardSnapshot
): string[] => [
  ...new Set(
    collectSnapshotItems(snapshot, (item) => item.imageRef?.hash ?? null)
  ),
]

// hashes needed for visible board rendering. board priority's primary blob
// (tile -> source -> preview) carries the visible quality; preview is warmed
// alongside as a cheap fallback while the primary decodes
export const collectSnapshotRenderImageRefs = (
  snapshot: BoardSnapshot
): TierItemImageRef[] =>
{
  const refs: TierItemImageRef[] = []
  const seen = new Set<ItemId>()
  const seenHashes = new Set<string>()
  const pushRef = (ref: TierItemImageRef | undefined): void =>
  {
    if (!ref || seenHashes.has(ref.hash)) return
    seenHashes.add(ref.hash)
    refs.push(ref)
  }
  const visitId = (id: ItemId): void =>
  {
    if (seen.has(id)) return
    seen.add(id)
    const item = snapshot.items[id]
    if (!item) return
    const primary = getPrimaryImageRef(item, 'board')
    pushRef(primary)
    if (primary && primary !== item.imageRef) pushRef(item.imageRef)
  }

  for (const tier of snapshot.tiers)
  {
    for (const id of tier.itemIds) visitId(id)
  }
  for (const id of snapshot.unrankedItemIds) visitId(id)

  return refs
}

export interface SnapshotRenderImageRef
{
  ref: TierItemImageRef
  variant: MediaVariantKind
}

export const collectSnapshotRenderImageVariantRefs = (
  snapshot: BoardSnapshot
): SnapshotRenderImageRef[] =>
{
  const refs: SnapshotRenderImageRef[] = []
  const seen = new Set<ItemId>()
  const seenKeys = new Set<string>()
  const pushRef = (
    ref: TierItemImageRef | undefined,
    variant: MediaVariantKind
  ): void =>
  {
    if (!ref) return
    const key = `${ref.hash}:${variant}`
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    refs.push({ ref, variant })
  }
  const visitId = (id: ItemId): void =>
  {
    if (seen.has(id)) return
    seen.add(id)
    const item = snapshot.items[id]
    if (!item?.imageRef) return
    pushRef(item.imageRef, 'tile')
    if (itemHasRenderTransform(item))
    {
      pushRef(item.sourceImageRef, 'editor')
    }
  }

  for (const tier of snapshot.tiers)
  {
    for (const id of tier.itemIds) visitId(id)
  }
  for (const id of snapshot.unrankedItemIds) visitId(id)

  return refs
}

export const collectSnapshotRenderImageHashes = (
  snapshot: BoardSnapshot
): string[] => collectSnapshotRenderImageRefs(snapshot).map((ref) => ref.hash)

// collect every editor-priority hash per item so wire export can fall back
// when source bytes are missing but tile or preview bytes are still present
export const collectSnapshotExportImageHashes = (
  snapshot: BoardSnapshot
): string[] =>
  Array.from(
    new Set(
      collectSnapshotItems(snapshot, (item) =>
        getImageRefsByRendition(item, 'editor').map((ref) => ref.hash)
      ).flat()
    )
  )

// collect every local blob hash the snapshot needs to retain — covers all
// three renditions (preview / tile / source) so IDB GC keeps each variant
export const collectSnapshotLocalImageHashes = (
  snapshot: BoardSnapshot
): string[] => [
  ...new Set(
    collectSnapshotItems(snapshot, (item) => [
      item.imageRef?.hash,
      item.tileImageRef?.hash,
      item.sourceImageRef?.hash,
    ])
      .flat()
      .filter(isPresent)
  ),
]

// map every snapshot item while preserving reference equality when unchanged
export const mapSnapshotItems = (
  snapshot: BoardSnapshot,
  mapItem: (item: TierItem, id: ItemId | null) => TierItem
): BoardSnapshot =>
{
  let changed = false

  const nextItems = Object.fromEntries(
    Object.entries(snapshot.items).map(([id, item]) =>
    {
      const mapped = mapItem(item, asItemId(id))
      if (mapped !== item)
      {
        changed = true
      }
      return [id, mapped]
    })
  ) as BoardSnapshot['items']

  const nextDeleted = snapshot.deletedItems.map((item) =>
  {
    const mapped = mapItem(item, null)
    if (mapped !== item)
    {
      changed = true
    }
    return mapped
  })

  if (!changed)
  {
    return snapshot
  }

  return {
    ...snapshot,
    items: nextItems,
    deletedItems: nextDeleted,
  }
}

interface TransformedSnapshotItems<TOut>
{
  items: Record<string, TOut>
  deletedItems: TOut[]
}

type SnapshotItemTask =
  | { kind: 'live'; entryIndex: number; id: string; item: TierItem }
  | { kind: 'deleted'; entryIndex: number; item: TierItem }

// concurrency-bounded async projection of every live & deleted item. output
// order for deletedItems matches snapshot order; items key order follows
// Object.entries iteration. pass Infinity for unbounded parallelism
export const transformSnapshotItemsAsync = async <TOut>(
  snapshot: BoardSnapshot,
  limit: number,
  mapItem: (item: TierItem, id: ItemId | null) => Promise<TOut>
): Promise<TransformedSnapshotItems<TOut>> =>
{
  const itemEntries = Object.entries(snapshot.items)
  const tasks: SnapshotItemTask[] = []
  const taskCount = Math.max(itemEntries.length, snapshot.deletedItems.length)
  for (let entryIndex = 0; entryIndex < taskCount; entryIndex++)
  {
    const liveEntry = itemEntries[entryIndex]
    if (liveEntry)
    {
      const [id, item] = liveEntry
      tasks.push({ kind: 'live', entryIndex, id, item })
    }

    const deletedItem = snapshot.deletedItems[entryIndex]
    if (deletedItem)
    {
      tasks.push({ kind: 'deleted', entryIndex, item: deletedItem })
    }
  }

  const runBounded = <T>(
    values: readonly T[],
    task: (value: T, index: number) => Promise<TOut>
  ): Promise<TOut[]> =>
    limit === Infinity
      ? Promise.all(values.map(task))
      : mapAsyncLimit(values, limit, task)

  const mapped = await runBounded(tasks, (task) =>
    task.kind === 'live'
      ? mapItem(task.item, asItemId(task.id))
      : mapItem(task.item, null)
  )
  const itemValues = new Array<TOut>(itemEntries.length)
  const deletedItems = new Array<TOut>(snapshot.deletedItems.length)

  for (let index = 0; index < tasks.length; index++)
  {
    const task = tasks[index]
    if (task.kind === 'live')
    {
      itemValues[task.entryIndex] = mapped[index]
    }
    else
    {
      deletedItems[task.entryIndex] = mapped[index]
    }
  }

  const items = Object.fromEntries(
    itemEntries.map(([id], index) => [id, itemValues[index]])
  )

  return { items, deletedItems }
}
