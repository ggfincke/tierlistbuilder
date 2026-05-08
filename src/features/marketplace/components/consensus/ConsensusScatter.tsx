// src/features/marketplace/components/consensus/ConsensusScatter.tsx
// avg-tier × agreement scatter — dot at (mean bucket, top-bucket share) so
// divisive items sink + strong-consensus picks rise

import { useMemo } from 'react'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import {
  bucketLabel,
  formatPercent,
  getAggregateItemLabel,
  getTopBucket,
  resolveBucketColor,
} from './utils'

interface ConsensusScatterProps
{
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  onOpenItem?: (
    row: MarketplaceTemplateRankingAggregateItem,
    target: Element
  ) => void
}

interface ScatterPoint
{
  row: MarketplaceTemplateRankingAggregateItem
  x: number
  y: number
  color: string
  agreement: number
}

const VIEWBOX_W = 720
const VIEWBOX_H = 360
const PAD = 36

const computePoints = (
  rows: readonly MarketplaceTemplateRankingAggregateItem[],
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[],
  paletteId: PaletteId
): ScatterPoint[] =>
{
  const lastBucket = Math.max(1, buckets.length - 1)
  const points: ScatterPoint[] = []
  for (const row of rows)
  {
    if (row.sampleCount === 0) continue
    if (row.averageBucket === null) continue
    if (row.topBucketIndex === null) continue
    const fracX = row.averageBucket / lastBucket
    const x = PAD + fracX * (VIEWBOX_W - 2 * PAD)
    const agreement = row.topBucketShare
    const y = VIEWBOX_H - PAD - agreement * (VIEWBOX_H - 2 * PAD)
    const bucket = getTopBucket(row, buckets)
    points.push({
      row,
      x,
      y,
      color: resolveBucketColor(bucket, paletteId),
      agreement,
    })
  }
  return points
}

export const ConsensusScatter = ({
  rows,
  buckets,
  onOpenItem,
}: ConsensusScatterProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const points = useMemo(
    () => computePoints(rows, buckets, paletteId),
    [rows, buckets, paletteId]
  )
  const lastBucket = Math.max(1, buckets.length - 1)
  const yLines = [0.25, 0.5, 0.75, 1]

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3 text-[11px] text-[var(--t-text-muted)]">
        <p>
          Each dot is one item.{' '}
          <span className="text-[var(--t-text-secondary)]">X axis</span>:
          average tier (S → F).{' '}
          <span className="text-[var(--t-text-secondary)]">Y axis</span>: how
          strongly the community agrees.
        </p>
        <div className="flex shrink-0 flex-col gap-1 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
          <span>↑ Strong consensus</span>
          <span>↓ Divisive</span>
        </div>
      </div>
      <div className="relative w-full overflow-hidden rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="block w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Average tier vs. community agreement"
        >
          {buckets.map((bucket, index) =>
          {
            const fracX = lastBucket === 0 ? 0 : index / lastBucket
            const x = PAD + fracX * (VIEWBOX_W - 2 * PAD)
            return (
              <g key={bucket.index}>
                <line
                  x1={x}
                  y1={PAD}
                  x2={x}
                  y2={VIEWBOX_H - PAD}
                  stroke="rgba(255,255,255,0.06)"
                />
                <text
                  x={x}
                  y={VIEWBOX_H - PAD + 18}
                  textAnchor="middle"
                  fill={resolveBucketColor(bucket, paletteId)}
                  fontSize={13}
                  fontWeight={700}
                  fontFamily="ui-monospace, monospace"
                >
                  {bucket.label}
                </text>
              </g>
            )
          })}
          {yLines.map((agreement) =>
          {
            const y = VIEWBOX_H - PAD - agreement * (VIEWBOX_H - 2 * PAD)
            return (
              <g key={agreement}>
                <line
                  x1={PAD}
                  y1={y}
                  x2={VIEWBOX_W - PAD}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                />
                <text
                  x={PAD - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--t-text-faint)"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                >
                  {Math.round(agreement * 100)}%
                </text>
              </g>
            )
          })}
          {points.map((point) =>
          {
            const label = getAggregateItemLabel(point.row)
            const averageBucketIndex =
              point.row.averageBucket !== null
                ? Math.round(point.row.averageBucket)
                : null
            const avgLabel = bucketLabel(buckets, averageBucketIndex)
            return (
              <g key={point.row.externalId}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={6.5}
                  fill={point.color}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={1}
                  opacity={0.92}
                  className="cursor-pointer"
                  onClick={(event) =>
                  {
                    if (onOpenItem)
                    {
                      onOpenItem(point.row, event.currentTarget)
                    }
                  }}
                  tabIndex={onOpenItem ? 0 : -1}
                >
                  <title>
                    {`${label} — avg ${avgLabel}, ${formatPercent(point.agreement)} agreement`}
                  </title>
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
