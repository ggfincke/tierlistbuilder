// src/features/marketplace/components/consensus/views/ConsensusBars.tsx
// alternate consensus viz — vertical list of items w/ a stacked distribution
// bar + headline stat. extracted so the toolbar can switch viz modes

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardItemDisplaySettings } from '@tierlistbuilder/contracts/workspace/board'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { formatCount } from '~/shared/catalog/formatters'
import { pluralizeWord } from '~/shared/lib/pluralize'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../item/AggregateItemThumb'
import { DistributionBar } from '../item/DistributionBar'
import {
  bucketLabel,
  formatPercent,
  getAggregateItemLabel,
  getTopBucket,
  resolveBucketColor,
} from '../lib/utils'

interface ConsensusBarsProps
{
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  displaySettings: BoardItemDisplaySettings
  showControversy: boolean
  onOpenItem: (
    row: MarketplaceTemplateRankingAggregateItem,
    target: Element
  ) => void
}

export const ConsensusBars = ({
  rows,
  buckets,
  frame,
  displaySettings,
  showControversy,
  onOpenItem,
}: ConsensusBarsProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  return (
    <ul className="space-y-2">
      {rows.map((row) =>
      {
        const top = getTopBucket(row, buckets)
        const headline =
          row.sampleCount > 0
            ? `${bucketLabel(buckets, row.topBucketIndex)} · ${formatPercent(
                row.topBucketShare
              )}`
            : 'No rankings yet'
        return (
          <li key={row.externalId}>
            <button
              type="button"
              onClick={(event) => onOpenItem(row, event.currentTarget)}
              className="focus-custom flex w-full items-center gap-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-2.5 text-left transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              <AggregateItemThumb
                row={row}
                frame={frame}
                displaySettings={displaySettings}
                size={56}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-[var(--t-text)]">
                    {getAggregateItemLabel(row)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
                    {formatCount(row.sampleCount)}{' '}
                    {pluralizeWord(row.sampleCount, 'rank')}
                  </span>
                </div>
                <DistributionBar
                  buckets={buckets}
                  distribution={row.distribution}
                  sampleCount={row.sampleCount}
                  height={10}
                />
              </div>
              <div className="flex w-32 shrink-0 flex-col items-end gap-0.5 text-right">
                <span
                  className="truncate text-xs font-semibold"
                  style={{
                    color: top
                      ? resolveBucketColor(top, paletteId)
                      : 'var(--t-text)',
                  }}
                >
                  {headline}
                </span>
                {showControversy && row.sampleCount > 0 ? (
                  <span className="text-[11px] text-[var(--t-text-muted)]">
                    controversy {formatPercent(row.controversyScore)}
                  </span>
                ) : (
                  row.averageBucket !== null && (
                    <span className="text-[11px] text-[var(--t-text-muted)]">
                      avg {bucketLabel(buckets, Math.round(row.averageBucket))}
                    </span>
                  )
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
