// src/features/marketplace/ui/consensus/section/ConsensusVizSwitch.tsx
// switch consensus aggregate rows across all visualization modes

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import { ConsensusBars } from '../views/ConsensusBars'
import { ConsensusHeatmap } from '../views/ConsensusHeatmap'
import { ConsensusRanked } from '../views/ConsensusRanked'
import { ConsensusScatter } from '../views/ConsensusScatter'
import { ConsensusTierRows } from '../views/ConsensusTierRows'
import { templateFrame, type ConsensusVizMode } from '../lib/utils'

interface ConsensusVizSwitchProps
{
  mode: ConsensusVizMode
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  template: MarketplaceTemplateDetail
  onOpenItem: (
    row: MarketplaceTemplateRankingAggregateItem,
    target: Element
  ) => void
  showControversy: boolean
  yourPlacements: Record<string, number> | null
}

export const ConsensusVizSwitch = ({
  mode,
  rows,
  buckets,
  template,
  onOpenItem,
  showControversy,
  yourPlacements,
}: ConsensusVizSwitchProps) =>
{
  const frame = templateFrame(template)
  switch (mode)
  {
    case 'tiers':
      return (
        <ConsensusTierRows
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={template}
          onOpenItem={onOpenItem}
          yourPlacements={yourPlacements}
        />
      )
    case 'bars':
      return (
        <ConsensusBars
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={template}
          showControversy={showControversy}
          onOpenItem={onOpenItem}
        />
      )
    case 'heatmap':
      return (
        <ConsensusHeatmap
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={template}
          onOpenItem={onOpenItem}
        />
      )
    case 'scatter':
      return (
        <ConsensusScatter
          rows={rows}
          buckets={buckets}
          onOpenItem={onOpenItem}
        />
      )
    case 'ranked':
      return (
        <ConsensusRanked
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={template}
          onOpenItem={onOpenItem}
        />
      )
    default:
      return null
  }
}
