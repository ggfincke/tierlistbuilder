// src/features/marketplace/components/discovery/useConsensusRailData.ts
// ranking rail queries for the consensus section

import { DEFAULT_RANKING_LIST_LIMIT } from '@tierlistbuilder/contracts/marketplace/ranking'
import { usePaginatedRankingsForTemplate } from '~/features/marketplace/model/useRankingDetail'
import type { ConsensusRailTab } from '../consensus/ConsensusRankingsRail'

const RAIL_PAGE_SIZE = DEFAULT_RANKING_LIST_LIMIT

const RAIL_SORT_BY_TAB: Record<
  ConsensusRailTab,
  'featured' | 'top' | 'recent'
> = {
  all: 'recent',
  featured: 'featured',
  top: 'top',
  recent: 'recent',
}

interface UseConsensusRailDataInput
{
  criterionExternalId: string
  enabled: boolean
  railTab: ConsensusRailTab
  templateSlug: string
}

export const useConsensusRailData = ({
  criterionExternalId,
  enabled,
  railTab,
  templateSlug,
}: UseConsensusRailDataInput) =>
{
  // rail data — server sort by featured/top/recent (All tab reuses recent
  // + loadMore). scoping by criterion keeps the rail in lockstep w/ viz
  const railSort = RAIL_SORT_BY_TAB[railTab]
  const railResult = usePaginatedRankingsForTemplate({
    templateSlug: enabled ? templateSlug : null,
    sort: railSort,
    criterionExternalId,
    enabled,
    pageSize: RAIL_PAGE_SIZE,
  })

  // spotlight is the top featured ranking, pinned above the rail tabs
  // regardless of which tab is active so the headline pick is always visible
  const featuredHead = usePaginatedRankingsForTemplate({
    templateSlug: enabled ? templateSlug : null,
    sort: 'featured',
    criterionExternalId,
    enabled,
    pageSize: 1,
  })

  return {
    railResult,
    spotlightRanking: featuredHead.items[0] ?? null,
  }
}
