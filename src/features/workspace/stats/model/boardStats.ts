// src/features/workspace/stats/model/boardStats.ts
// pure statistics computation for board data — items per tier, distribution, & summary

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import type { PaletteId } from '@/shared/types/theme'
import { resolveTierColorSpec } from '@/shared/theme/tierColors'

export interface TierStat
{
  name: string
  color: string
  count: number
  percentage: number
}

export interface BoardStats
{
  tierDistribution: TierStat[]
  totalItems: number
  rankedItems: number
  unrankedItems: number
  averageTierIndex: number | null
  mostPopulatedTier: string | null
  leastPopulatedTier: string | null
  emptyTiers: number
}

// compute statistics from a board's data
export const computeBoardStats = (
  data: BoardSnapshot,
  paletteId: PaletteId
): BoardStats =>
{
  const rankedItems = data.tiers.reduce(
    (sum, tier) => sum + tier.itemIds.length,
    0
  )
  const unrankedItems = data.unrankedItemIds.length
  const totalItems = rankedItems + unrankedItems

  const tierDistribution: TierStat[] = data.tiers.map((tier) => ({
    name: tier.name,
    color: resolveTierColorSpec(paletteId, tier.colorSpec),
    count: tier.itemIds.length,
    percentage: totalItems > 0 ? (tier.itemIds.length / totalItems) * 100 : 0,
  }))

  // unranked pool as a virtual "tier" entry
  if (unrankedItems > 0)
  {
    tierDistribution.push({
      name: 'Unranked',
      color: '#666666',
      count: unrankedItems,
      percentage: totalItems > 0 ? (unrankedItems / totalItems) * 100 : 0,
    })
  }

  // weighted average tier index (only for ranked items)
  let averageTierIndex: number | null = null
  if (rankedItems > 0)
  {
    const weightedSum = data.tiers.reduce(
      (sum, tier, index) => sum + tier.itemIds.length * index,
      0
    )
    averageTierIndex = weightedSum / rankedItems
  }

  // find most & least populated tiers (among tiers w/ items)
  const tiersWithItems = data.tiers.filter((t) => t.itemIds.length > 0)
  let mostPopulatedTier: string | null = null
  let leastPopulatedTier: string | null = null

  if (tiersWithItems.length > 0)
  {
    const sorted = [...tiersWithItems].sort(
      (a, b) => b.itemIds.length - a.itemIds.length
    )
    mostPopulatedTier = sorted[0].name
    leastPopulatedTier = sorted[sorted.length - 1].name
  }

  const emptyTiers = data.tiers.filter((t) => t.itemIds.length === 0).length

  return {
    tierDistribution,
    totalItems,
    rankedItems,
    unrankedItems,
    averageTierIndex,
    mostPopulatedTier,
    leastPopulatedTier,
    emptyTiers,
  }
}
