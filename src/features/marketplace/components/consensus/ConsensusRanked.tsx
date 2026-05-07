// src/features/marketplace/components/consensus/ConsensusRanked.tsx
// compact 2-col ranked list — sorts by average bucket (highest tier first)
// & shows rank index + thumb + tier badge + share %. the "leaderboard" view

import { useMemo } from 'react'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from './AggregateItemThumb'
import { formatPercent, resolveBucketColor } from './utils'

interface ConsensusRankedProps
{
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  onOpenItem: (
    row: MarketplaceTemplateRankingAggregateItem,
    target: Element
  ) => void
}

const sortByAverage = (
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
): MarketplaceTemplateRankingAggregateItem[] =>
{
  // null avgs (zero-sample items) sort to the bottom — keeps the leaderboard
  // honest about which items don't yet have a community signal
  const score = (row: MarketplaceTemplateRankingAggregateItem): number =>
    row.averageBucket ?? Number.POSITIVE_INFINITY
  return [...rows].sort((a, b) => score(a) - score(b))
}

export const ConsensusRanked = ({
  rows,
  buckets,
  frame,
  labelSettings,
  onOpenItem,
}: ConsensusRankedProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const sorted = useMemo(() => sortByAverage(rows), [rows])
  return (
    <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {sorted.map((row, index) =>
      {
        const bucket =
          row.topBucketIndex !== null ? buckets[row.topBucketIndex] : undefined
        const label = row.label?.trim() || row.templateItemExternalId
        return (
          <li key={row.externalId}>
            <button
              type="button"
              onClick={(event) => onOpenItem(row, event.currentTarget)}
              className="focus-custom flex w-full items-center gap-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2.5 py-1.5 text-left transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-[var(--t-text-faint)]">
                {index + 1}
              </span>
              <AggregateItemThumb
                row={row}
                frame={frame}
                labelSettings={labelSettings}
                size={32}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--t-text)]">
                {label}
              </span>
              {bucket && (
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
                  style={{
                    background: resolveBucketColor(bucket, paletteId),
                    color: 'rgba(0,0,0,0.78)',
                  }}
                >
                  {bucket.label}
                </span>
              )}
              <span className="w-10 shrink-0 text-right font-mono text-[10px] text-[var(--t-text-muted)]">
                {row.sampleCount > 0 ? formatPercent(row.topBucketShare) : '—'}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
