// src/features/marketplace/components/consensus/ItemPopover.tsx
// click-anchored popover w/ stats tiles. fixed-positioned + flips above the
// anchor when the viewport runs out of room below

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from './AggregateItemThumb'
import { DistributionBar } from './DistributionBar'
import type { PopoverAnchorRect } from './usePopover'
import { formatPercent, resolveBucketColor } from './utils'

interface ItemPopoverProps
{
  row: MarketplaceTemplateRankingAggregateItem
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  anchorRect: PopoverAnchorRect
  onClose: () => void
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
}

const PANEL_W = 280
const PANEL_H = 240
const GAP = 8

export const ItemPopover = ({
  row,
  buckets,
  anchorRect,
  onClose,
  frame,
  labelSettings,
}: ItemPopoverProps) =>
{
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() =>
  {
    const onDoc = (e: MouseEvent): void =>
    {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void =>
    {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () =>
    {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const vpW = window.innerWidth
  const vpH = window.innerHeight
  const placeBelow = anchorRect.bottom + GAP + PANEL_H < vpH
  const top = placeBelow
    ? anchorRect.bottom + GAP
    : anchorRect.top - GAP - PANEL_H
  const desiredLeft = anchorRect.left + anchorRect.width / 2 - PANEL_W / 2
  const left = Math.max(8, Math.min(desiredLeft, vpW - PANEL_W - 8))

  const topBucket =
    row.topBucketIndex !== null ? buckets[row.topBucketIndex] : undefined
  const avgIdx =
    row.averageBucket !== null ? Math.round(row.averageBucket) : null
  const avgBucket = avgIdx !== null ? buckets[avgIdx] : undefined

  const controversyLabel =
    row.sampleCount === 0
      ? 'No data'
      : row.controversyScore < 0.3
        ? 'Strong consensus'
        : row.controversyScore < 0.55
          ? 'Mixed'
          : 'Highly divisive'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${row.label ?? row.templateItemExternalId} community stats`}
      className="fixed z-50 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] shadow-2xl"
      style={{
        top,
        left,
        width: PANEL_W,
        animation: 'scaleIn 140ms cubic-bezier(0.2, 0, 0, 1) both',
      }}
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--t-border)] px-3 py-2.5">
        <AggregateItemThumb
          row={row}
          frame={frame}
          labelSettings={labelSettings}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--t-text)]">
            {row.label?.trim() || row.templateItemExternalId}
          </p>
          <p className="truncate text-[11px] text-[var(--t-text-muted)]">
            {row.sampleCount} {row.sampleCount === 1 ? 'ranking' : 'rankings'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-custom inline-flex h-6 w-6 items-center justify-center rounded text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
            Distribution
          </p>
          <div className="mt-1.5">
            <DistributionBar
              buckets={buckets}
              distribution={row.distribution}
              sampleCount={row.sampleCount}
              height={10}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
              Top
            </p>
            <p
              className="mt-0.5 text-sm font-bold"
              style={{ color: resolveBucketColor(topBucket) }}
            >
              {topBucket?.label ?? '—'}
            </p>
            <p className="text-[10px] text-[var(--t-text-muted)]">
              {formatPercent(row.topBucketShare)}
            </p>
          </div>
          <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
              Avg
            </p>
            <p
              className="mt-0.5 text-sm font-bold"
              style={{
                color: avgBucket
                  ? resolveBucketColor(avgBucket)
                  : 'var(--t-text)',
              }}
            >
              {avgBucket?.label ?? '—'}
            </p>
            <p className="text-[10px] text-[var(--t-text-muted)]">
              {row.averageBucket !== null ? row.averageBucket.toFixed(1) : '—'}
            </p>
          </div>
          <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
              Spread
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--t-text)]">
              {Math.round(row.controversyScore * 100)}
            </p>
            <p className="text-[10px] text-[var(--t-text-muted)]">
              {controversyLabel}
            </p>
          </div>
        </div>
        <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-2 py-1.5 text-[11px] leading-relaxed text-[var(--t-text-muted)]">
          {row.sampleCount > 0 && topBucket ? (
            <>
              Most often placed in{' '}
              <strong style={{ color: resolveBucketColor(topBucket) }}>
                {topBucket.label}
              </strong>{' '}
              tier ({formatPercent(row.topBucketShare)} of rankings).
            </>
          ) : (
            'No rankings yet.'
          )}
        </div>
      </div>
    </div>
  )
}
