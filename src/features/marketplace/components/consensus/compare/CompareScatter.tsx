// src/features/marketplace/components/consensus/compare/CompareScatter.tsx
// item averageBucket scatter: left lane on x, right lane on y; diagonal
// = agreement, off-diagonal = disagreement; top-4 outliers labeled

import { useMemo } from 'react'

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { resolveBucketColor } from '../utils'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import type { CompareJoinedRow } from './laneUtils'
import { getAggregateItemLabel } from '../utils'

interface CompareScatterProps
{
  rows: readonly CompareJoinedRow[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  leftShortName: string
  rightShortName: string
}

const CHART_W = 560
const CHART_H = 380
const PADDING = 38

export const CompareScatter = ({
  rows,
  buckets,
  leftShortName,
  rightShortName,
}: CompareScatterProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const bucketCount = buckets.length

  // pre-project every row into pixel coords; rows w/o averageBucket on
  // either side drop out so empty lanes don't pile up at (0, 0)
  const points = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.left.averageBucket !== null && row.right.averageBucket !== null
        )
        .map((row) =>
        {
          const xValue = row.left.averageBucket as number
          const yValue = row.right.averageBucket as number
          const denom = Math.max(1, bucketCount - 1)
          const x = PADDING + (xValue / denom) * (CHART_W - 2 * PADDING)
          const y = PADDING + (yValue / denom) * (CHART_H - 2 * PADDING)
          // color the dot by the average of both lanes' buckets so the
          // visual identity reads as "where the item lands overall"
          const avgIndex = Math.round((xValue + yValue) / 2)
          const colorBucket =
            buckets[Math.max(0, Math.min(bucketCount - 1, avgIndex))]
          return {
            externalId: row.templateItemExternalId,
            label: getAggregateItemLabel(row.left),
            x,
            y,
            absDelta: row.absDelta,
            color: resolveBucketColor(colorBucket, paletteId),
          }
        }),
    [bucketCount, buckets, paletteId, rows]
  )

  // annotate the four most divergent points so users can recognize the
  // outliers without hovering every dot
  const annotated = useMemo(
    () => [...points].sort((a, b) => b.absDelta - a.absDelta).slice(0, 4),
    [points]
  )

  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
            Lane vs lane
          </p>
          <p className="text-[13px] font-semibold text-[var(--t-text)]">
            Average tier per item
          </p>
        </div>
        <p className="max-w-[180px] text-right text-[11px] leading-snug text-[var(--t-text-muted)]">
          Diagonal = identical. Off-diagonal items lean toward one lane.
        </p>
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <line
            x1={PADDING}
            y1={PADDING}
            x2={CHART_W - PADDING}
            y2={CHART_H - PADDING}
            stroke="rgb(var(--t-overlay) / 0.16)"
            strokeDasharray="4 4"
          />
          {buckets.map((bucket, i) =>
          {
            const denom = Math.max(1, bucketCount - 1)
            const x = PADDING + (i / denom) * (CHART_W - 2 * PADDING)
            const y = PADDING + (i / denom) * (CHART_H - 2 * PADDING)
            const color = resolveBucketColor(bucket, paletteId)
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={PADDING}
                  x2={x}
                  y2={CHART_H - PADDING}
                  stroke="rgb(var(--t-overlay) / 0.05)"
                />
                <line
                  x1={PADDING}
                  y1={y}
                  x2={CHART_W - PADDING}
                  y2={y}
                  stroke="rgb(var(--t-overlay) / 0.05)"
                />
                <text
                  x={x}
                  y={CHART_H - PADDING + 16}
                  textAnchor="middle"
                  fill={color}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  {bucket.label}
                </text>
                <text
                  x={PADDING - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={color}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  {bucket.label}
                </text>
              </g>
            )
          })}
          <text
            x={CHART_W / 2}
            y={CHART_H - 4}
            textAnchor="middle"
            fill="var(--t-text-faint)"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.14em"
          >
            {leftShortName.toUpperCase()} →
          </text>
          <text
            x={12}
            y={CHART_H / 2}
            textAnchor="middle"
            fill="var(--t-text-faint)"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.14em"
            transform={`rotate(-90 12 ${CHART_H / 2})`}
          >
            {rightShortName.toUpperCase()} →
          </text>
          {points.map((point) => (
            <circle
              key={point.externalId}
              cx={point.x}
              cy={point.y}
              r={point.absDelta >= 2 ? 6 : 4.5}
              fill={point.color}
              opacity={0.85}
              stroke={
                point.absDelta >= 2
                  ? 'var(--t-destructive)'
                  : point.absDelta === 1
                    ? 'var(--t-accent)'
                    : 'rgba(0,0,0,0.45)'
              }
              strokeWidth={point.absDelta >= 1 ? 1.5 : 1}
            >
              <title>{point.label}</title>
            </circle>
          ))}
          {annotated.map((point) => (
            <g key={`ann-${point.externalId}`}>
              <line
                x1={point.x}
                y1={point.y}
                x2={point.x + 14}
                y2={point.y - 14}
                stroke="rgb(var(--t-overlay) / 0.4)"
                strokeWidth="1"
              />
              <rect
                x={point.x + 12}
                y={point.y - 26}
                rx="3"
                ry="3"
                width={Math.max(28, point.label.length * 5.4 + 8)}
                height="14"
                fill="rgba(0,0,0,0.7)"
                stroke="rgb(var(--t-overlay) / 0.12)"
              />
              <text
                x={point.x + 16}
                y={point.y - 16}
                fill="white"
                fontSize="10"
                fontFamily="ui-sans-serif, system-ui"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="mt-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[rgb(var(--t-overlay)/0.3)]"
          />
          Aligned
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full ring-2 ring-[var(--t-accent)]"
          />
          1 tier off
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full ring-2 ring-[var(--t-destructive)]"
          />
          2+ tiers off
        </span>
      </p>
    </div>
  )
}
