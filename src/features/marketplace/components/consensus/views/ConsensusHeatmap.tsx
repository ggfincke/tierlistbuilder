// src/features/marketplace/components/consensus/views/ConsensusHeatmap.tsx
// items × buckets grid — each cell is a tier-share % w/ color-mixed intensity
// so spread patterns pop visually

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { Fragment } from 'react'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../item/AggregateItemThumb'
import {
  distributionShareByBucket,
  formatPercent,
  getAggregateItemLabel,
  resolveBucketColor,
} from '../lib/utils'

interface ConsensusHeatmapProps
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

// uses css color-mix so the cell bg fades from full bucket color (high share)
// down to surface (zero share) — keeps each row legible against the matte
const cellBackground = (color: string, share: number): string =>
{
  if (share <= 0) return 'var(--t-bg-surface)'
  const intensity = Math.min(1, share * 1.6)
  const pct = Math.round(intensity * 70)
  return `color-mix(in srgb, ${color} ${pct}%, var(--t-bg-surface))`
}

const cellTextColor = (share: number): string =>
{
  const intensity = Math.min(1, share * 1.6)
  return intensity > 0.45 ? 'rgba(0,0,0,0.85)' : 'var(--t-text-muted)'
}

export const ConsensusHeatmap = ({
  rows,
  buckets,
  frame,
  labelSettings,
  onOpenItem,
}: ConsensusHeatmapProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const colCount = buckets.length
  const gridTemplateColumns = `minmax(160px,1.2fr) repeat(${colCount},minmax(36px,1fr)) 56px`
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
      <div
        role="grid"
        className="grid items-center gap-px bg-[var(--t-border)]"
        style={{ gridTemplateColumns }}
      >
        <div
          role="columnheader"
          className="bg-[var(--t-bg-sunken)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]"
        >
          Item
        </div>
        {buckets.map((bucket) => (
          <div
            key={bucket.index}
            role="columnheader"
            className="bg-[var(--t-bg-sunken)] px-1 py-2 text-center font-mono text-[11px] font-semibold"
            style={{ color: resolveBucketColor(bucket, paletteId) }}
          >
            {bucket.label}
          </div>
        ))}
        <div
          role="columnheader"
          className="bg-[var(--t-bg-sunken)] px-2 py-2 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]"
        >
          n
        </div>

        {rows.map((row) =>
        {
          const label = getAggregateItemLabel(row)
          const byBucket = distributionShareByBucket(row)
          return (
            <Fragment key={row.externalId}>
              <button
                type="button"
                onClick={(event) => onOpenItem(row, event.currentTarget)}
                className="focus-custom flex items-center gap-2 bg-[var(--t-bg-surface)] px-2 py-1.5 text-left transition hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              >
                <AggregateItemThumb
                  row={row}
                  frame={frame}
                  labelSettings={labelSettings}
                  size={28}
                />
                <span className="truncate text-[13px] text-[var(--t-text)]">
                  {label}
                </span>
              </button>
              {buckets.map((bucket) =>
              {
                const share = byBucket.get(bucket.index) ?? 0
                const color = resolveBucketColor(bucket, paletteId)
                return (
                  <div
                    key={bucket.index}
                    role="gridcell"
                    className="flex items-center justify-center px-1 py-1.5 font-mono text-[10px]"
                    title={`${bucket.label} · ${formatPercent(share)}`}
                    style={{
                      background: cellBackground(color, share),
                      color: cellTextColor(share),
                    }}
                  >
                    {share > 0 ? formatPercent(share) : ''}
                  </div>
                )
              })}
              <div
                role="gridcell"
                className="bg-[var(--t-bg-surface)] px-2 py-1.5 text-right font-mono text-[11px] text-[var(--t-text-muted)]"
              >
                {row.sampleCount}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
