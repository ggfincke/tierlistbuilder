// convex/workspace/boards/librarySummary.ts
// denormalized board-card summary derived on board writes

import type { Id } from '../../_generated/dataModel'
import {
  LIBRARY_BOARD_COVER_ITEM_LIMIT,
  LIBRARY_BOARD_TIER_LIMIT,
  type LibraryBoardTierBreakdown,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TierColorSpec } from '@tierlistbuilder/contracts/lib/theme'

export interface BoardLibrarySummaryCoverItem
{
  label: string | null
  externalId: string
  storageId: Id<'_storage'> | null
}

export interface BoardLibrarySummary
{
  coverItems: BoardLibrarySummaryCoverItem[]
  tierColors: TierColorSpec[]
  tierBreakdown: LibraryBoardTierBreakdown[]
}

export interface BoardLibrarySummaryTier
{
  key: string
  order: number
  colorSpec: TierColorSpec
}

export interface BoardLibrarySummaryItem
{
  tierKey: string | null
  externalId: string
  label: string | null | undefined
  storageId: Id<'_storage'> | null
  order: number
  deletedAt: number | null
}

export const EMPTY_BOARD_LIBRARY_SUMMARY: BoardLibrarySummary = {
  coverItems: [],
  tierColors: [],
  tierBreakdown: [],
}

export const buildBoardLibrarySummary = (params: {
  tiers: readonly BoardLibrarySummaryTier[]
  items: readonly BoardLibrarySummaryItem[]
}): BoardLibrarySummary =>
{
  const tiers = [...params.tiers].sort((a, b) => a.order - b.order)
  const itemsByTier = new Map<string, BoardLibrarySummaryItem[]>()
  const unrankedItems: BoardLibrarySummaryItem[] = []

  for (const item of params.items)
  {
    if (item.deletedAt !== null) continue
    if (item.tierKey === null)
    {
      unrankedItems.push(item)
      continue
    }

    const existing = itemsByTier.get(item.tierKey)
    if (existing)
    {
      existing.push(item)
    }
    else
    {
      itemsByTier.set(item.tierKey, [item])
    }
  }

  for (const items of itemsByTier.values())
  {
    items.sort((a, b) => a.order - b.order)
  }
  unrankedItems.sort((a, b) => a.order - b.order)

  const tierBreakdown: LibraryBoardTierBreakdown[] = []
  for (let i = 0; i < tiers.length; i++)
  {
    if (tierBreakdown.length >= LIBRARY_BOARD_TIER_LIMIT) break
    const tier = tiers[i]
    const itemCount = itemsByTier.get(tier.key)?.length ?? 0
    if (itemCount === 0) continue
    tierBreakdown.push({
      tierIndex: i,
      itemCount,
      colorSpec: tier.colorSpec,
    })
  }

  const orderedItems: BoardLibrarySummaryItem[] = []
  for (const tier of tiers)
  {
    const items = itemsByTier.get(tier.key)
    if (items) orderedItems.push(...items)
    if (orderedItems.length >= LIBRARY_BOARD_COVER_ITEM_LIMIT) break
  }
  if (orderedItems.length < LIBRARY_BOARD_COVER_ITEM_LIMIT)
  {
    orderedItems.push(...unrankedItems)
  }

  return {
    coverItems: orderedItems
      .slice(0, LIBRARY_BOARD_COVER_ITEM_LIMIT)
      .map((item) => ({
        label: item.label ?? null,
        externalId: item.externalId,
        storageId: item.storageId,
      })),
    tierColors: tiers
      .slice(0, LIBRARY_BOARD_TIER_LIMIT)
      .map((tier) => tier.colorSpec),
    tierBreakdown,
  }
}
