// src/features/marketplace/model/detail/useCompareLanes.ts
// auto-load aggregate item pages for compare lanes

import { useEffect } from 'react'

import type { MarketplaceTemplateRankingAggregateItem } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  useTemplateRankingAggregateItems,
  type TemplateRankingAggregateItemsPageStatus,
} from '~/features/marketplace/model/detail/useRankingDetail'

export interface CompareLaneItemsResult
{
  items: MarketplaceTemplateRankingAggregateItem[]
  status: TemplateRankingAggregateItemsPageStatus
  loadMore: (count?: number) => void
}

export const useCompareLaneItems = (
  templateSlug: string,
  criterionExternalId: string,
  generation: number | null,
  enabled: boolean
): CompareLaneItemsResult =>
{
  const result = useTemplateRankingAggregateItems({
    templateSlug,
    criterionExternalId,
    generation,
    sort: 'templateOrder',
    enabled,
    pageSize: 100,
  })
  const { status, loadMore } = result

  // template order is stable; keep paging until the compare lane is exhaustive
  useEffect(() =>
  {
    if (!enabled) return
    if (status === 'CanLoadMore')
    {
      loadMore(100)
    }
  }, [enabled, loadMore, status])

  return result
}
