// src/shared/lib/boardSnapshotItems.ts
// board snapshot item traversal helpers shared by image, export, & share code

import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { isPresent } from '~/shared/lib/typeGuards'

// visit every live & deleted snapshot item in stable order
export const forEachSnapshotItem = (
  snapshot: BoardSnapshot,
  visit: (item: TierItem, id: ItemId | null) => void
): void =>
{
  for (const [id, item] of Object.entries(snapshot.items))
  {
    visit(item, id as ItemId)
  }

  for (const item of snapshot.deletedItems)
  {
    visit(item, null)
  }
}

// collect derived values while traversing every snapshot item once
export const collectSnapshotItems = <T>(
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
      const mapped = mapItem(item, id as ItemId)
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

// async variant for transforms that depend on storage or hashing work
export const mapSnapshotItemsAsync = async (
  snapshot: BoardSnapshot,
  mapItem: (item: TierItem, id: ItemId | null) => Promise<TierItem>
): Promise<BoardSnapshot> =>
{
  let changed = false

  const nextItems = Object.fromEntries(
    await Promise.all(
      Object.entries(snapshot.items).map(async ([id, item]) =>
      {
        const mapped = await mapItem(item, id as ItemId)
        if (mapped !== item)
        {
          changed = true
        }
        return [id, mapped]
      })
    )
  ) as BoardSnapshot['items']

  const nextDeleted = await Promise.all(
    snapshot.deletedItems.map(async (item) =>
    {
      const mapped = await mapItem(item, null)
      if (mapped !== item)
      {
        changed = true
      }
      return mapped
    })
  )

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
