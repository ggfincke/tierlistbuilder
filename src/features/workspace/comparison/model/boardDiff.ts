// src/features/workspace/comparison/model/boardDiff.ts
// pure diff computation between two boards — match items, detect promotions & demotions

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'

export interface DiffEntry
{
  // item ID in board A
  itemIdA: string
  // item ID in board B (may differ if matched by label)
  itemIdB: string
  // display label for the item
  label: string
  // tier index in board A (tiers.length = unranked)
  tierIndexA: number
  // tier index in board B
  tierIndexB: number
  // tier name in board A
  tierNameA: string
  // tier name in board B
  tierNameB: string
  // movement direction
  change: 'promoted' | 'demoted' | 'unchanged'
}

export interface BoardDiff
{
  entries: DiffEntry[]
  // items only in board B (not in A)
  addedToB: string[]
  // items only in board A (not in B)
  removedFromB: string[]
  promoted: number
  demoted: number
  unchanged: number
}

// build a map of item ID → tier index for a board
const buildTierIndexMap = (data: BoardSnapshot): Map<string, number> =>
{
  const map = new Map<string, number>()
  for (let i = 0; i < data.tiers.length; i++)
  {
    for (const itemId of data.tiers[i].itemIds)
    {
      map.set(itemId, i)
    }
  }
  // unranked items get index = tiers.length (lowest rank)
  for (const itemId of data.unrankedItemIds)
  {
    map.set(itemId, data.tiers.length)
  }
  return map
}

// get the tier name for an index (or "Unranked" for out-of-bounds)
const tierName = (data: BoardSnapshot, index: number): string =>
  index < data.tiers.length ? data.tiers[index].name : 'Unranked'

// compute the diff between two boards
export const computeBoardDiff = (
  boardA: BoardSnapshot,
  boardB: BoardSnapshot
): BoardDiff =>
{
  const indexMapA = buildTierIndexMap(boardA)
  const indexMapB = buildTierIndexMap(boardB)

  // match items: first by exact ID, then by case-insensitive label
  const matchedA = new Set<string>()
  const matchedB = new Set<string>()
  const matches: Array<{ idA: string; idB: string }> = []

  // pass 1: exact ID match
  for (const idA of indexMapA.keys())
  {
    if (indexMapB.has(idA))
    {
      matches.push({ idA, idB: idA })
      matchedA.add(idA)
      matchedB.add(idA)
    }
  }

  // pass 2: label-based matching for unmatched items
  const unmatchedA = [...indexMapA.keys()].filter((id) => !matchedA.has(id))
  const unmatchedB = [...indexMapB.keys()].filter((id) => !matchedB.has(id))

  // build label → IDs map for board B's unmatched items
  const labelMapB = new Map<string, string[]>()
  for (const idB of unmatchedB)
  {
    const item = boardB.items[idB]
    if (!item?.label) continue
    const key = item.label.toLowerCase()
    const existing = labelMapB.get(key) ?? []
    existing.push(idB)
    labelMapB.set(key, existing)
  }

  for (const idA of unmatchedA)
  {
    const itemA = boardA.items[idA]
    if (!itemA?.label) continue
    const key = itemA.label.toLowerCase()
    const candidates = labelMapB.get(key)
    if (candidates && candidates.length > 0)
    {
      const idB = candidates.shift()!
      matches.push({ idA, idB })
      matchedA.add(idA)
      matchedB.add(idB)
      if (candidates.length === 0) labelMapB.delete(key)
    }
  }

  // build diff entries
  const entries: DiffEntry[] = []
  let promoted = 0
  let demoted = 0
  let unchanged = 0

  for (const { idA, idB } of matches)
  {
    const tierIdxA = indexMapA.get(idA)!
    const tierIdxB = indexMapB.get(idB)!
    const label = boardA.items[idA]?.label ?? boardB.items[idB]?.label ?? 'Item'

    let change: DiffEntry['change'] = 'unchanged'
    if (tierIdxB < tierIdxA)
    {
      change = 'promoted'
      promoted++
    }
    else if (tierIdxB > tierIdxA)
    {
      change = 'demoted'
      demoted++
    }
    else
    {
      unchanged++
    }

    entries.push({
      itemIdA: idA,
      itemIdB: idB,
      label,
      tierIndexA: tierIdxA,
      tierIndexB: tierIdxB,
      tierNameA: tierName(boardA, tierIdxA),
      tierNameB: tierName(boardB, tierIdxB),
      change,
    })
  }

  // items only in B
  const addedToB = [...indexMapB.keys()].filter((id) => !matchedB.has(id))
  // items only in A
  const removedFromB = [...indexMapA.keys()].filter((id) => !matchedA.has(id))

  return { entries, addedToB, removedFromB, promoted, demoted, unchanged }
}
