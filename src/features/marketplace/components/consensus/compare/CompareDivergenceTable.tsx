// src/features/marketplace/components/consensus/compare/CompareDivergenceTable.tsx
// sortable table of items ordered by absolute Δ tier across two lanes —
// each row pairs an item thumb w/ both lanes' top tier + distribution

import { ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../AggregateItemThumb'
import { DistributionBar } from '../DistributionBar'
import {
  formatPercent,
  getAggregateItemLabel,
  resolveBucketColor,
} from '../utils'
import { TextInput } from '~/shared/ui/TextInput'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import {
  compareDirectionCopy,
  type CompareJoinedRow,
  safeBucketLabel,
} from './laneUtils'

type DivergenceSort = 'absDelta' | 'leftFirst' | 'rightFirst' | 'mostSamples'

interface CompareDivergenceTableProps
{
  rows: readonly CompareJoinedRow[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  leftShortName: string
  rightShortName: string
  // initial cap on rendered rows; "Show all" toggles to the full list when
  // the user wants to scroll past the leaderboard. defaults to 12 to match
  // the design exploration's editorial framing
  initialLimit?: number
}

const SORT_LABELS: Record<DivergenceSort, string> = {
  absDelta: 'Biggest gap',
  leftFirst: 'Higher in left',
  rightFirst: 'Higher in right',
  mostSamples: 'Most samples',
}

const compareRows = (
  sort: DivergenceSort
): ((a: CompareJoinedRow, b: CompareJoinedRow) => number) =>
{
  switch (sort)
  {
    case 'absDelta':
      return (a, b) => b.absDelta - a.absDelta
    case 'leftFirst':
      // most negative delta first (right index lower than left = higher in
      // left lane)
      return (a, b) => a.delta - b.delta
    case 'rightFirst':
      return (a, b) => b.delta - a.delta
    case 'mostSamples':
      return (a, b) =>
        b.left.sampleCount +
        b.right.sampleCount -
        (a.left.sampleCount + a.right.sampleCount)
  }
}

const matchesSearch = (row: CompareJoinedRow, needle: string): boolean =>
{
  const label = getAggregateItemLabel(row.left).toLowerCase()
  return label.includes(needle)
}

interface BucketCellProps
{
  bucket: MarketplaceTemplateRankingAggregateBucket | undefined
  share: number
  fallbackIndex: number | null
}

const BucketCell = ({ bucket, share, fallbackIndex }: BucketCellProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const color = resolveBucketColor(bucket, paletteId)
  return (
    <span
      className="inline-flex items-baseline gap-1 font-mono text-[12px] font-bold"
      style={{ color }}
    >
      {bucket?.label ??
        (fallbackIndex !== null ? `Tier ${fallbackIndex + 1}` : '—')}
      <span className="text-[10px] font-normal text-[var(--t-text-muted)]">
        {formatPercent(share)}
      </span>
    </span>
  )
}

interface DeltaCellProps
{
  delta: number
  absDelta: number
}

const DeltaCell = ({ delta, absDelta }: DeltaCellProps) =>
{
  const tone =
    absDelta >= 2
      ? 'var(--t-destructive)'
      : absDelta === 1
        ? 'var(--t-accent)'
        : 'var(--t-text-faint)'
  return (
    <span
      className="flex items-center justify-end gap-0.5 text-right font-mono text-[12px] tabular-nums"
      style={{ color: tone }}
    >
      {delta < 0 ? (
        <ArrowLeft className="h-3 w-3" strokeWidth={2.4} />
      ) : delta > 0 ? (
        <ArrowRight className="h-3 w-3" strokeWidth={2.4} />
      ) : null}
      {absDelta || '—'}
    </span>
  )
}

export const CompareDivergenceTable = ({
  rows,
  buckets,
  frame,
  labelSettings,
  leftShortName,
  rightShortName,
  initialLimit = 12,
}: CompareDivergenceTableProps) =>
{
  const [sort, setSort] = useState<DivergenceSort>('absDelta')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() =>
  {
    const needle = query.trim().toLowerCase()
    const candidates = needle
      ? rows.filter((row) => matchesSearch(row, needle))
      : [...rows]
    candidates.sort(compareRows(sort))
    return candidates
  }, [query, rows, sort])
  const visibleRows = showAll ? filtered : filtered.slice(0, initialLimit)
  const hiddenCount = Math.max(0, filtered.length - visibleRows.length)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--t-border)] bg-[var(--t-bg-sunken)]/60 px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--t-text-faint)]"
            strokeWidth={2}
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items"
            size="sm"
            className="!h-8 w-full !pl-7"
            aria-label="Search items"
          />
        </div>
        <label className="inline-flex items-center gap-1 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] pl-2 pr-1 text-[11px] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)]">
          <span className="font-mono uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
            Sort
          </span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as DivergenceSort)}
            className="focus-custom h-7 cursor-pointer appearance-none bg-transparent pr-5 text-[12px] font-medium text-[var(--t-text)] focus:outline-none"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hidden grid-cols-[1.4fr_0.7fr_1fr_0.7fr_1fr_0.5fr] items-center gap-3 border-b border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)] md:grid">
        <span>Item</span>
        <span>{leftShortName}</span>
        <span>Distribution</span>
        <span>{rightShortName}</span>
        <span>Distribution</span>
        <span className="text-right">Δ</span>
      </div>
      {visibleRows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-[var(--t-text-muted)]">
          No items match this filter.
        </div>
      ) : (
        visibleRows.map((row) =>
          {
          const leftBucket =
            row.left.topBucketIndex !== null
              ? buckets[row.left.topBucketIndex]
              : undefined
          const rightBucket =
            row.right.topBucketIndex !== null
              ? buckets[row.right.topBucketIndex]
              : undefined
          const lean = compareDirectionCopy(
            row.delta,
            leftShortName,
            rightShortName
          )
          const tone =
            row.absDelta >= 2
              ? 'var(--t-destructive)'
              : row.absDelta === 1
                ? 'var(--t-accent)'
                : 'var(--t-text-faint)'
          return (
            <div
              key={row.templateItemExternalId}
              className="grid grid-cols-1 items-center gap-2 border-t border-[var(--t-border)] px-4 py-2.5 first:border-t-0 hover:bg-[var(--t-bg-hover)] md:grid-cols-[1.4fr_0.7fr_1fr_0.7fr_1fr_0.5fr] md:gap-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <AggregateItemThumb
                  row={row.left}
                  frame={frame}
                  labelSettings={labelSettings}
                  size={32}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[var(--t-text)]">
                    {getAggregateItemLabel(row.left)}
                  </p>
                  <p className="text-[10px]" style={{ color: tone }}>
                    {lean}
                    {row.delta !== 0 && row.absDelta > 0 && (
                      <>
                        {' · Δ'}
                        {row.absDelta} {row.absDelta === 1 ? 'tier' : 'tiers'}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <BucketCell
                bucket={leftBucket}
                share={row.left.topBucketShare}
                fallbackIndex={row.left.topBucketIndex}
              />
              <div>
                <DistributionBar
                  buckets={buckets}
                  distribution={row.left.distribution}
                  sampleCount={row.left.sampleCount}
                  height={6}
                />
                <p className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)] sm:block">
                  {row.left.sampleCount}{' '}
                  {row.left.sampleCount === 1 ? 'sample' : 'samples'} ·{' '}
                  {safeBucketLabel(buckets, row.left.topBucketIndex)}
                </p>
              </div>
              <BucketCell
                bucket={rightBucket}
                share={row.right.topBucketShare}
                fallbackIndex={row.right.topBucketIndex}
              />
              <div>
                <DistributionBar
                  buckets={buckets}
                  distribution={row.right.distribution}
                  sampleCount={row.right.sampleCount}
                  height={6}
                />
                <p className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)] sm:block">
                  {row.right.sampleCount}{' '}
                  {row.right.sampleCount === 1 ? 'sample' : 'samples'} ·{' '}
                  {safeBucketLabel(buckets, row.right.topBucketIndex)}
                </p>
              </div>
              <DeltaCell delta={row.delta} absDelta={row.absDelta} />
            </div>
          )
        })
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="focus-custom flex w-full items-center justify-center gap-1 border-t border-[var(--t-border)] px-3 py-2.5 text-[11px] font-medium text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          Show all {filtered.length} items
        </button>
      )}
      {showAll && filtered.length > initialLimit && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="focus-custom flex w-full items-center justify-center gap-1 border-t border-[var(--t-border)] px-3 py-2.5 text-[11px] font-medium text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          Collapse to top {initialLimit}
        </button>
      )}
    </div>
  )
}
