// src/features/marketplace/ui/consensus/section/useConsensusBodyState.ts
// local view state for a consensus lane

import { useCallback, useState } from 'react'

import type { TemplateRankingAggregateItemSort } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { ConsensusRailTab } from '../rail/ConsensusRankingsRail'
import type { ConsensusVizMode } from '../lib/utils'

export const useConsensusBodyState = (criterionExternalId: string) =>
{
  const [sort, setSort] =
    useState<TemplateRankingAggregateItemSort>('templateOrder')
  const [vizMode, setVizMode] = useState<ConsensusVizMode>('tiers')
  const [searchQuery, setSearchQuery] = useState('')
  // pin is stored alongside the criterion it was set in so a lane switch
  // implicitly resets the pin during render — avoids a setState-in-effect
  const [activePin, setActivePin] = useState<{
    slug: string
    criterion: string
  } | null>(null)
  const [railTab, setRailTab] = useState<ConsensusRailTab>('recent')

  const activeSlug =
    activePin && activePin.criterion === criterionExternalId
      ? activePin.slug
      : null
  const setActiveSlug = useCallback(
    (slug: string | null) =>
    {
      setActivePin(
        slug === null ? null : { slug, criterion: criterionExternalId }
      )
    },
    [criterionExternalId]
  )

  return {
    activeSlug,
    railTab,
    searchQuery,
    setActiveSlug,
    setRailTab,
    setSearchQuery,
    setSort,
    setVizMode,
    sort,
    vizMode,
  }
}
