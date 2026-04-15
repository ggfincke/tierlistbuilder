// src/features/workspace/boards/model/boardOps.ts
// pure board operations — sorting & shuffling helpers

import type { Tier, TierItem } from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

type ItemLookup = Record<ItemId, Pick<TierItem, 'label'> | undefined>
type RandomIndexResolver = (maxExclusive: number) => number

export type ShuffleMode = 'even' | 'random'

interface BoardShuffleResult
{
  tiers: Tier[]
  unrankedItemIds: ItemId[]
}

const resolveRandomIndex = (maxExclusive: number): number =>
{
  return Math.floor(Math.random() * maxExclusive)
}

// compare items by label for alphabetical sort (unlabeled items sort last)
export const compareByLabel = (
  items: ItemLookup,
  a: ItemId,
  b: ItemId
): number =>
{
  const la = items[a]?.label ?? ''
  const lb = items[b]?.label ?? ''

  if (!la && !lb) return 0
  if (!la) return 1
  if (!lb) return -1

  return la.localeCompare(lb, 'en', { sensitivity: 'base' })
}

// run Fisher-Yates in place so callers can clone before shuffling as needed
export const fisherYatesShuffle = <T>(
  arr: T[],
  nextIndex: RandomIndexResolver = resolveRandomIndex
): T[] =>
{
  for (let i = arr.length - 1; i > 0; i--)
  {
    const j = nextIndex(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr
}

// sort one tier's item IDs alphabetically while preserving every other tier
export const sortTierItemsByName = (
  tiers: Tier[],
  tierId: string,
  items: ItemLookup
): Tier[] | null =>
{
  const tier = tiers.find((entry) => entry.id === tierId)

  if (!tier || tier.itemIds.length <= 1)
  {
    return null
  }

  const sorted = [...tier.itemIds].sort((a, b) => compareByLabel(items, a, b))

  return tiers.map((entry) =>
    entry.id === tierId ? { ...entry, itemIds: sorted } : entry
  )
}

// shuffle every board item, then redistribute the shuffled set into tiers
export const shuffleAllBoardItems = (
  tiers: Tier[],
  unrankedItemIds: ItemId[],
  mode: ShuffleMode,
  nextIndex: RandomIndexResolver = resolveRandomIndex
): BoardShuffleResult | null =>
{
  const allItemIds = [
    ...tiers.flatMap((tier) => tier.itemIds),
    ...unrankedItemIds,
  ]

  if (allItemIds.length === 0 || tiers.length === 0)
  {
    return null
  }

  const shuffled = fisherYatesShuffle([...allItemIds], nextIndex)
  const nextTiers = tiers.map((tier) => ({
    ...tier,
    itemIds: [] as ItemId[],
  }))

  if (mode === 'even')
  {
    for (let i = 0; i < shuffled.length; i++)
    {
      nextTiers[i % nextTiers.length].itemIds.push(shuffled[i])
    }
  }
  else
  {
    for (const itemId of shuffled)
    {
      nextTiers[nextIndex(nextTiers.length)].itemIds.push(itemId)
    }
  }

  return {
    tiers: nextTiers,
    unrankedItemIds: [],
  }
}

// shuffle only unranked items, then interleave them into existing tier order
export const shuffleUnrankedItems = (
  tiers: Tier[],
  unrankedItemIds: ItemId[],
  nextIndex: RandomIndexResolver = resolveRandomIndex
): BoardShuffleResult | null =>
{
  if (unrankedItemIds.length === 0 || tiers.length === 0)
  {
    return null
  }

  const unranked = fisherYatesShuffle([...unrankedItemIds], nextIndex)
  const insertions: ItemId[][] = tiers.map(() => [])

  for (const itemId of unranked)
  {
    insertions[nextIndex(tiers.length)].push(itemId)
  }

  const nextTiers = tiers.map((tier, index) =>
  {
    const existing = [...tier.itemIds]

    for (const itemId of insertions[index])
    {
      existing.splice(nextIndex(existing.length + 1), 0, itemId)
    }

    return { ...tier, itemIds: existing }
  })

  return {
    tiers: nextTiers,
    unrankedItemIds: [],
  }
}
