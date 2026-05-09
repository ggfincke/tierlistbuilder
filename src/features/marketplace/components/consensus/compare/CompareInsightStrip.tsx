// src/features/marketplace/components/consensus/compare/CompareInsightStrip.tsx
// four-card KPI strip summarizing two criterion lanes — gauge, fraction,
// histogram, split-bar — each w/ a distinct visual language

import { formatCount } from '~/shared/catalog/formatters'

import { correlationCopy, type CompareInsights } from './laneUtils'

interface CompareInsightStripProps
{
  insights: CompareInsights
  leftRankingCount: number
  rightRankingCount: number
  leftShortName: string
  rightShortName: string
}

// === Style A: gauge for Pearson correlation ===
const polar = (cx: number, cy: number, r: number, deg: number) =>
{
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

interface GaugeProps
{
  correlation: number | null
}

const correlationTone = (correlation: number | null): string =>
{
  if (correlation === null) return 'var(--t-text-muted)'
  if (correlation >= 0.6) return 'var(--t-success)'
  if (correlation >= 0.2) return 'var(--t-warning, #facc15)'
  if (correlation >= -0.2) return 'var(--t-text-muted)'
  return 'var(--t-destructive)'
}

const InsightGauge = ({ correlation }: GaugeProps) =>
{
  const t = correlation === null ? 0.5 : (correlation + 1) / 2
  const arcLen = 220
  const start = -90 - arcLen / 2
  const end = -90 + arcLen / 2
  const zero = -90
  const valueAngle = start + arcLen * t
  const r = 36
  const cx = 50
  const cy = 50
  const arc = (a1: number, a2: number) =>
  {
    const p1 = polar(cx, cy, r, a1)
    const p2 = polar(cx, cy, r, a2)
    const large = Math.abs(a2 - a1) > 180 ? 1 : 0
    const sweep = a2 > a1 ? 1 : 0
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} ${sweep} ${p2.x} ${p2.y}`
  }
  const tone = correlationTone(correlation)
  // value sweep: positive runs from zero->valueAngle, negative reverses
  const showValue = correlation !== null
  const valueArc =
    correlation === null
      ? null
      : correlation >= 0
        ? arc(zero, valueAngle)
        : arc(valueAngle, zero)
  const needle = polar(cx, cy, r, valueAngle)
  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
        Lane correlation
      </p>
      <div className="relative mt-2 flex items-center justify-center">
        <svg
          viewBox="0 0 100 64"
          className="h-[78px] w-full"
          aria-hidden="true"
        >
          <path
            d={arc(start, end)}
            stroke="var(--t-bg-sunken)"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
          {[start, zero, end].map((a, i) =>
          {
            const a1 = polar(cx, cy, r - 7, a)
            const a2 = polar(cx, cy, r - 3, a)
            return (
              <line
                key={i}
                x1={a1.x}
                y1={a1.y}
                x2={a2.x}
                y2={a2.y}
                stroke="var(--t-border-hover)"
                strokeWidth="1"
                strokeLinecap="round"
              />
            )
          })}
          {showValue && valueArc && (
            <>
              <path
                d={valueArc}
                stroke={tone}
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx={needle.x} cy={needle.y} r="2.5" fill={tone} />
            </>
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
          <span
            className="text-[24px] font-semibold leading-none tabular-nums tracking-tight"
            style={{ color: tone }}
          >
            {correlation === null
              ? '—'
              : `${correlation > 0 ? '+' : ''}${(correlation * 100).toFixed(0)}`}
            {correlation !== null && (
              <span className="text-[14px] font-medium text-[var(--t-text-muted)]">
                %
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
        <span>−1</span>
        <span>0</span>
        <span>+1</span>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--t-text-muted)]">
        {correlationCopy(correlation)}
      </p>
    </div>
  )
}

// === Style B: stacked-segment fraction ===
const InsightFraction = ({
  numerator,
  denominator,
}: {
  numerator: number
  denominator: number
}) =>
{
  const pct = denominator ? numerator / denominator : 0
  const tone =
    pct > 0.5
      ? 'var(--t-destructive)'
      : pct > 0.25
        ? 'var(--t-warning, #facc15)'
        : 'var(--t-text)'
  const segCount = Math.min(Math.max(denominator, 1), 24)
  const filled = Math.round((numerator / Math.max(denominator, 1)) * segCount)
  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
          Moved 2+ tiers
        </p>
        <span className="rounded-md bg-[var(--t-bg-sunken)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--t-text-secondary)]">
          {(pct * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="text-[32px] font-semibold leading-none tabular-nums tracking-tight"
          style={{ color: tone }}
        >
          {numerator}
        </span>
        <span className="font-mono text-[14px] font-light text-[var(--t-text-faint)]">
          /
        </span>
        <span className="text-[14px] font-medium leading-none tabular-nums text-[var(--t-text-muted)]">
          {denominator}
        </span>
      </div>
      <div className="mt-2.5 flex h-2 gap-[2px]" aria-hidden="true">
        {Array.from({ length: segCount }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              background: i < filled ? tone : 'var(--t-bg-sunken)',
            }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--t-text-muted)]">
        Items that swing hard between lanes
      </p>
    </div>
  )
}

// === Style C: average Δ + histogram sparkline ===
const InsightHistogram = ({
  avgDelta,
  histogram,
}: {
  avgDelta: number
  histogram: readonly number[]
}) =>
{
  const peak = Math.max(...histogram, 1)
  const avgIndex = Math.min(
    histogram.length - 1,
    Math.max(0, Math.round(avgDelta))
  )
  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
          Avg tier shift
        </p>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
          Δ-distribution
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[14px] text-[var(--t-text-muted)]">
          Δ
        </span>
        <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[var(--t-text)]">
          {avgDelta.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
          tiers
        </span>
      </div>
      <div className="mt-2.5 flex h-[40px] items-end gap-[3px]">
        {histogram.map((count, i) =>
        {
          const h = (count / peak) * 100
          const isAvgBin = i === avgIndex
          return (
            <div
              key={i}
              className="group relative flex flex-1 flex-col justify-end"
              title={`Δ${i} · ${count} item${count === 1 ? '' : 's'}`}
            >
              <div
                className="w-full rounded-[2px]"
                style={{
                  height: count === 0 ? '2px' : `${Math.max(8, h)}%`,
                  background:
                    count === 0
                      ? 'var(--t-border)'
                      : isAvgBin
                        ? 'var(--t-accent)'
                        : 'var(--t-border-hover)',
                  opacity: count === 0 ? 0.6 : 1,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--t-text-faint)]">
        {histogram.map((_, i) => (
          <span
            key={i}
            className={i === avgIndex ? 'text-[var(--t-accent)]' : ''}
          >
            Δ{i}
          </span>
        ))}
      </div>
    </div>
  )
}

// === Style D: split bar of total samples by lane ===
const InsightSplit = ({
  leftRankingCount,
  rightRankingCount,
  leftShortName,
  rightShortName,
}: {
  leftRankingCount: number
  rightRankingCount: number
  leftShortName: string
  rightShortName: string
}) =>
{
  const total = leftRankingCount + rightRankingCount
  const leftShare = total === 0 ? 0.5 : leftRankingCount / total
  const rightShare = 1 - leftShare
  // skip inventing a per-criterion palette: every compare surface uses the
  // same left=accent / right=success token mapping so the lane identities
  // stay legible across pages without contract changes
  const leftTone = 'var(--t-accent)'
  const rightTone = 'var(--t-success)'
  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
          Total samples
        </p>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
          2 lanes
        </span>
      </div>
      <p className="mt-1.5 text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[var(--t-text)]">
        {formatCount(total)}
      </p>
      <div
        className="mt-2.5 flex h-3 overflow-hidden rounded-md"
        aria-hidden="true"
      >
        <div
          className="flex items-center justify-end pr-1 font-mono text-[9px] font-semibold tabular-nums text-[var(--t-bg-page)]"
          style={{ width: `${leftShare * 100}%`, background: leftTone }}
        >
          {leftShare > 0.18 ? `${Math.round(leftShare * 100)}%` : ''}
        </div>
        <div
          className="flex items-center justify-end pr-1 font-mono text-[9px] font-semibold tabular-nums text-[var(--t-bg-page)]"
          style={{ width: `${rightShare * 100}%`, background: rightTone }}
        >
          {rightShare > 0.18 ? `${Math.round(rightShare * 100)}%` : ''}
        </div>
      </div>
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ background: leftTone }}
          />
          <span className="truncate text-[var(--t-text-secondary)]">
            {leftShortName}
          </span>
          <span className="ml-auto font-mono tabular-nums text-[var(--t-text)]">
            {formatCount(leftRankingCount)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ background: rightTone }}
          />
          <span className="truncate text-[var(--t-text-secondary)]">
            {rightShortName}
          </span>
          <span className="ml-auto font-mono tabular-nums text-[var(--t-text)]">
            {formatCount(rightRankingCount)}
          </span>
        </div>
      </div>
    </div>
  )
}

export const CompareInsightStrip = ({
  insights,
  leftRankingCount,
  rightRankingCount,
  leftShortName,
  rightShortName,
}: CompareInsightStripProps) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <InsightGauge correlation={insights.correlation} />
    <InsightFraction
      numerator={insights.movedTwoPlus}
      denominator={insights.sampleCount}
    />
    <InsightHistogram
      avgDelta={insights.avgDelta}
      histogram={insights.deltaHistogram}
    />
    <InsightSplit
      leftRankingCount={leftRankingCount}
      rightRankingCount={rightRankingCount}
      leftShortName={leftShortName}
      rightShortName={rightShortName}
    />
  </div>
)
