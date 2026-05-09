// src/features/marketplace/components/consensus/compare/CompareTierFlow.tsx
// sankey ribbons from left-lane tiers to right-lane tiers; thickness =
// migration size, color = source tier so the "letting go" reads clearly

import { useMemo } from 'react'

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { resolveBucketColor } from '../utils'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import { buildBucketFlowMatrix, type CompareJoinedRow } from './laneUtils'

interface CompareTierFlowProps
{
  rows: readonly CompareJoinedRow[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  leftShortName: string
  rightShortName: string
}

const CHART_W = 480
const CHART_H = 380
const PAD_TOP = 24
const PAD_BOTTOM = 28
const LEFT_X = 90
const RIGHT_X = CHART_W - 90
const BAR_W = 22

interface Stack
{
  top: number
  height: number
}

interface Flow
{
  i: number
  j: number
  count: number
  lY: number
  lh: number
  rh: number
  rY: number
}

const buildStacks = (
  totals: readonly number[],
  grand: number,
  bucketCount: number
): Stack[] =>
{
  const totalH = CHART_H - PAD_TOP - PAD_BOTTOM
  const gap = 4
  const usable = totalH - gap * Math.max(0, bucketCount - 1)
  let y = PAD_TOP
  return totals.map((count) =>
  {
    const h = grand === 0 ? 0 : (count / grand) * usable
    const top = y
    y += h + gap
    return { top, height: Math.max(0.5, h) }
  })
}

export const CompareTierFlow = ({
  rows,
  buckets,
  leftShortName,
  rightShortName,
}: CompareTierFlowProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const bucketCount = buckets.length

  // matrix[i][j] = count of items in left tier i that landed in right
  // tier j. zero rows are valid — the bar shows up but no ribbons leave it
  const matrix = useMemo(
    () => buildBucketFlowMatrix(rows, bucketCount),
    [bucketCount, rows]
  )

  const leftTotals = useMemo(
    () => matrix.map((row) => row.reduce((a, b) => a + b, 0)),
    [matrix]
  )
  const rightTotals = useMemo(() =>
  {
    const totals = new Array<number>(bucketCount).fill(0)
    for (let i = 0; i < bucketCount; i++)
    {
      for (let j = 0; j < bucketCount; j++)
      {
        totals[j] += matrix[i]?.[j] ?? 0
      }
    }
    return totals
  }, [bucketCount, matrix])
  const grand = leftTotals.reduce((a, b) => a + b, 0)

  const leftStacks = useMemo(
    () => buildStacks(leftTotals, grand, bucketCount),
    [bucketCount, grand, leftTotals]
  )
  const rightStacks = useMemo(
    () => buildStacks(rightTotals, grand, bucketCount),
    [bucketCount, grand, rightTotals]
  )

  const flows = useMemo<Flow[]>(() =>
  {
    const out: Flow[] = []
    const lOffsets = new Array<number>(bucketCount).fill(0)
    for (let i = 0; i < bucketCount; i++)
    {
      for (let j = 0; j < bucketCount; j++)
      {
        const count = matrix[i]?.[j] ?? 0
        if (!count) continue
        const lh = leftStacks[i].height * (count / Math.max(1, leftTotals[i]))
        const rh = rightStacks[j].height * (count / Math.max(1, rightTotals[j]))
        const lY = leftStacks[i].top + lOffsets[i]
        lOffsets[i] += lh
        out.push({ i, j, count, lY, lh, rh, rY: 0 })
      }
    }
    // assign target offsets per right bucket once all sources are known
    const rOffsets = new Array<number>(bucketCount).fill(0)
    out.sort((a, b) => a.i - b.i)
    for (const flow of out)
    {
      flow.rY = rightStacks[flow.j].top + rOffsets[flow.j]
      rOffsets[flow.j] += flow.rh
    }
    return out
  }, [bucketCount, leftStacks, leftTotals, matrix, rightStacks, rightTotals])

  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
            Tier flow
          </p>
          <p className="text-[13px] font-semibold text-[var(--t-text)]">
            {leftShortName} → {rightShortName}
          </p>
        </div>
        <p className="max-w-[180px] text-right text-[11px] leading-snug text-[var(--t-text-muted)]">
          Bar height = items in tier. Ribbon thickness = how many items shift to
          that tier on the right.
        </p>
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <text
            x={LEFT_X + BAR_W / 2}
            y={PAD_TOP - 8}
            textAnchor="middle"
            fill="var(--t-text-faint)"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.14em"
          >
            {leftShortName.toUpperCase()}
          </text>
          <text
            x={RIGHT_X + BAR_W / 2}
            y={PAD_TOP - 8}
            textAnchor="middle"
            fill="var(--t-text-faint)"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.14em"
          >
            {rightShortName.toUpperCase()}
          </text>
          {flows.map((flow, idx) =>
          {
            const x1 = LEFT_X + BAR_W
            const x2 = RIGHT_X
            const cy1Top = flow.lY
            const cy1Bot = flow.lY + flow.lh
            const cy2Top = flow.rY
            const cy2Bot = flow.rY + flow.rh
            const midX = (x1 + x2) / 2
            const same = flow.i === flow.j
            const delta = Math.abs(flow.i - flow.j)
            const baseFill = resolveBucketColor(buckets[flow.i], paletteId)
            const opacity = same ? 0.32 : delta >= 2 ? 0.55 : 0.42
            return (
              <path
                key={idx}
                d={`M ${x1} ${cy1Top} C ${midX} ${cy1Top}, ${midX} ${cy2Top}, ${x2} ${cy2Top} L ${x2} ${cy2Bot} C ${midX} ${cy2Bot}, ${midX} ${cy1Bot}, ${x1} ${cy1Bot} Z`}
                fill={baseFill}
                opacity={opacity}
              >
                <title>{`${flow.count} item${
                  flow.count === 1 ? '' : 's'
                }: ${buckets[flow.i]?.label ?? `Tier ${flow.i + 1}`} → ${
                  buckets[flow.j]?.label ?? `Tier ${flow.j + 1}`
                }`}</title>
              </path>
            )
          })}
          {leftStacks.map((stack, i) =>
          {
            const color = resolveBucketColor(buckets[i], paletteId)
            return (
              <g key={`L${i}`}>
                <rect
                  x={LEFT_X}
                  y={stack.top}
                  width={BAR_W}
                  height={stack.height}
                  fill={color}
                />
                <text
                  x={LEFT_X - 6}
                  y={stack.top + stack.height / 2 + 3}
                  textAnchor="end"
                  fill={color}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  {buckets[i]?.label ?? ''}
                </text>
                <text
                  x={LEFT_X - 6}
                  y={stack.top + stack.height / 2 + 14}
                  textAnchor="end"
                  fill="var(--t-text-faint)"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {leftTotals[i]}
                </text>
              </g>
            )
          })}
          {rightStacks.map((stack, i) =>
          {
            const color = resolveBucketColor(buckets[i], paletteId)
            return (
              <g key={`R${i}`}>
                <rect
                  x={RIGHT_X}
                  y={stack.top}
                  width={BAR_W}
                  height={stack.height}
                  fill={color}
                />
                <text
                  x={RIGHT_X + BAR_W + 6}
                  y={stack.top + stack.height / 2 + 3}
                  textAnchor="start"
                  fill={color}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  {buckets[i]?.label ?? ''}
                </text>
                <text
                  x={RIGHT_X + BAR_W + 6}
                  y={stack.top + stack.height / 2 + 14}
                  textAnchor="start"
                  fill="var(--t-text-faint)"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {rightTotals[i]}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
        Ribbons colored by source tier · hover for counts
      </p>
    </div>
  )
}
