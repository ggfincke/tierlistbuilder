// src/features/marketplace/ui/consensus/compare/CompareScatter.tsx
// item averageBucket scatter: left lane on x, right lane on y; diagonal
// = agreement, off-diagonal = disagreement; top-4 outliers labeled

import { useMemo, useState } from 'react'

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { resolveBucketColor } from '../lib/utils'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { clamp } from '~/shared/lib/math'

import {
  compareDeltaDirectionTone,
  LEFT_LANE_TONE,
  RIGHT_LANE_TONE,
  type CompareJoinedRow,
} from './laneUtils'
import { CompareCard, COMPARE_EYEBROW_CLASS } from './CompareCard'
import { getAggregateItemLabel } from '../lib/utils'

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
const HOVER_SCALE = 2.4

const dotRadius = (absDelta: number): number =>
  absDelta >= 2 ? 11 : absDelta === 1 ? 9 : 8

export const CompareScatter = ({
  rows,
  buckets,
  leftShortName,
  rightShortName,
}: CompareScatterProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const bucketCount = buckets.length
  const bucketDenom = Math.max(1, bucketCount - 1)

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
          const x = PADDING + (xValue / bucketDenom) * (CHART_W - 2 * PADDING)
          const y = PADDING + (yValue / bucketDenom) * (CHART_H - 2 * PADDING)
          // color the dot by the average of both lanes' buckets so the
          // visual identity reads as "where the item lands overall"
          const avgIndex = Math.round((xValue + yValue) / 2)
          const colorBucket = buckets[clamp(avgIndex, 0, bucketCount - 1)]
          return {
            externalId: row.templateItemExternalId,
            label: getAggregateItemLabel(row.left),
            x,
            y,
            delta: row.delta,
            absDelta: row.absDelta,
            color: resolveBucketColor(colorBucket, paletteId),
            imageUrl: row.left.media?.url ?? row.right.media?.url ?? null,
            altText: row.left.altText ?? row.right.altText ?? null,
          }
        }),
    [bucketCount, bucketDenom, buckets, paletteId, rows]
  )

  // draw least-divergent first so high-Δ thumbs win the z-fight in dense
  // clusters — the items most worth identifying stay visible
  const drawOrder = useMemo(
    () => [...points].sort((a, b) => a.absDelta - b.absDelta),
    [points]
  )

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // SVG has no z-index — lift the hovered dot to the end of the array so it
  // renders above its neighbors. keyed by externalId so React shifts the DOM
  // node instead of remounting it (which would cancel the scale transition)
  const orderedDraw = useMemo(() =>
  {
    if (!hoveredId) return drawOrder
    const idx = drawOrder.findIndex((p) => p.externalId === hoveredId)
    if (idx === -1) return drawOrder
    return [
      ...drawOrder.slice(0, idx),
      ...drawOrder.slice(idx + 1),
      drawOrder[idx],
    ]
  }, [drawOrder, hoveredId])
  const hoveredPoint = useMemo(
    () =>
      hoveredId
        ? (points.find((p) => p.externalId === hoveredId) ?? null)
        : null,
    [hoveredId, points]
  )

  // annotate the four most divergent points so users can recognize the
  // outliers without hovering every dot
  const annotated = useMemo(
    () => [...points].sort((a, b) => b.absDelta - a.absDelta).slice(0, 4),
    [points]
  )

  return (
    <CompareCard padding="sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={COMPARE_EYEBROW_CLASS}>Lane vs lane</p>
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
            const x = PADDING + (i / bucketDenom) * (CHART_W - 2 * PADDING)
            const y = PADDING + (i / bucketDenom) * (CHART_H - 2 * PADDING)
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
          <defs>
            <clipPath id="scatter-thumb-clip" clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
          </defs>
          {orderedDraw.map((point) =>
          {
            const isHovered = point.externalId === hoveredId
            const r = dotRadius(point.absDelta)
            const stroke =
              point.absDelta === 0
                ? 'rgba(0,0,0,0.55)'
                : compareDeltaDirectionTone(point.delta)
            const strokeWidth =
              point.absDelta >= 2 ? 2.25 : point.absDelta === 1 ? 1.75 : 1.25
            return (
              <g
                key={point.externalId}
                onMouseEnter={() => setHoveredId(point.externalId)}
                onMouseLeave={() =>
                  setHoveredId((prev) =>
                    prev === point.externalId ? null : prev
                  )
                }
                style={{
                  cursor: 'pointer',
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  transform: isHovered ? `scale(${HOVER_SCALE})` : undefined,
                  transition: 'transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                {point.imageUrl ? (
                  <>
                    {/* solid backer so transparent thumbs read against the
                        sunken chart bg */}
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={r}
                      fill={point.color}
                      opacity={0.55}
                    />
                    {/* top-anchored crop: tall portrait sprites have the
                        recognizable bit (face/head) in the upper third, so
                        biasing the slice up keeps faces inside the dot
                        instead of clipping them off above */}
                    <image
                      href={point.imageUrl}
                      x={point.x - r}
                      y={point.y - r}
                      width={r * 2}
                      height={r * 2}
                      preserveAspectRatio="xMidYMin slice"
                      clipPath="url(#scatter-thumb-clip)"
                    />
                  </>
                ) : (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={r}
                    fill={point.color}
                    opacity={0.85}
                  />
                )}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={r}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
                <title>{point.label}</title>
              </g>
            )
          })}
          {annotated.map((point) => (
            <g key={`ann-${point.externalId}`}>
              <line
                x1={point.x}
                y1={point.y}
                x2={point.x + 18}
                y2={point.y - 18}
                stroke="rgb(var(--t-overlay) / 0.4)"
                strokeWidth="1"
              />
              <rect
                x={point.x + 16}
                y={point.y - 30}
                rx="3"
                ry="3"
                width={Math.max(28, point.label.length * 5.4 + 8)}
                height="14"
                fill="rgba(0,0,0,0.7)"
                stroke="rgb(var(--t-overlay) / 0.12)"
              />
              <text
                x={point.x + 20}
                y={point.y - 20}
                fill="white"
                fontSize="10"
                fontFamily="ui-sans-serif, system-ui"
              >
                {point.label}
              </text>
            </g>
          ))}
          {hoveredPoint &&
            (() =>
            {
              // label sits outside the scaled <g> so it doesn't grow w/ the
              // dot. flip above the dot when there's no room below; clamp
              // horizontally so the tag never escapes the chart bounds
              const scaledR = dotRadius(hoveredPoint.absDelta) * HOVER_SCALE
              const labelW = Math.max(44, hoveredPoint.label.length * 6 + 14)
              const labelH = 16
              const placeBelow =
                hoveredPoint.y + scaledR + labelH + 8 < CHART_H - PADDING / 2
              const labelY = placeBelow
                ? hoveredPoint.y + scaledR + 6
                : hoveredPoint.y - scaledR - labelH - 6
              const minX = labelW / 2 + 4
              const maxX = CHART_W - labelW / 2 - 4
              const labelX =
                minX <= maxX ? clamp(hoveredPoint.x, minX, maxX) : maxX
              return (
                <g pointerEvents="none">
                  <rect
                    x={labelX - labelW / 2}
                    y={labelY}
                    width={labelW}
                    height={labelH}
                    rx="3"
                    ry="3"
                    fill="rgba(0,0,0,0.88)"
                    stroke="rgb(var(--t-overlay) / 0.2)"
                  />
                  <text
                    x={labelX}
                    y={labelY + 11}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontFamily="ui-sans-serif, system-ui"
                  >
                    {hoveredPoint.label}
                  </text>
                </g>
              )
            })()}
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ boxShadow: `0 0 0 2px ${LEFT_LANE_TONE}` }}
          />
          Higher in {leftShortName}
        </span>
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
            className="h-2 w-2 rounded-full"
            style={{ boxShadow: `0 0 0 2px ${RIGHT_LANE_TONE}` }}
          />
          Higher in {rightShortName}
        </span>
        <span className="ml-auto text-[9px] normal-case tracking-normal text-[var(--t-text-faint)]">
          larger dot = bigger gap
        </span>
      </p>
    </CompareCard>
  )
}
