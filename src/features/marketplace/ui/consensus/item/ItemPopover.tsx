// src/features/marketplace/ui/consensus/item/ItemPopover.tsx
// click-anchored popover w/ stats tiles. fixed-positioned + flips above the
// anchor when the viewport runs out of room below

import { useCallback, useRef } from 'react'
import { X } from 'lucide-react'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardItemDisplaySettings } from '@tierlistbuilder/contracts/workspace/board'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useAnchoredPopup } from '~/shared/overlay/anchoredPopup'
import { OverlayPanelSurface } from '~/shared/overlay/OverlaySurface'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from './AggregateItemThumb'
import { DistributionBar } from './DistributionBar'
import type { PopoverAnchorRect } from './usePopover'
import {
  formatPercent,
  getAggregateItemLabel,
  getAverageBucket,
  getControversyLabel,
  getTopBucket,
  resolveBucketColor,
} from '../lib/utils'

interface ItemPopoverProps
{
  row: MarketplaceTemplateRankingAggregateItem
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  anchorRect: PopoverAnchorRect
  onClose: () => void
  frame: AggregateItemFrame
  displaySettings: BoardItemDisplaySettings
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
  displaySettings,
}: ItemPopoverProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const ref = useRef<HTMLDivElement>(null)

  const computePosition = useCallback(() =>
  {
    const vpW = window.innerWidth
    const vpH = window.innerHeight
    const placeBelow = anchorRect.bottom + GAP + PANEL_H < vpH
    const top = placeBelow
      ? anchorRect.bottom + GAP
      : anchorRect.top - GAP - PANEL_H
    const desiredLeft = anchorRect.left + anchorRect.width / 2 - PANEL_W / 2
    const left = Math.max(8, Math.min(desiredLeft, vpW - PANEL_W - 8))
    return {
      top,
      left,
      width: PANEL_W,
      animation: 'scaleIn 140ms cubic-bezier(0.2, 0, 0, 1) both',
    }
  }, [anchorRect])

  const { style } = useAnchoredPopup({
    open: true,
    popupRef: ref,
    onClose,
    positionUpdateMode: 'close',
    computePosition,
  })

  const topBucket = getTopBucket(row, buckets)
  const avgBucket = getAverageBucket(row, buckets)
  const itemLabel = getAggregateItemLabel(row)
  const controversyLabel = getControversyLabel(row)

  return (
    <OverlayPanelSurface
      ref={ref}
      role="dialog"
      aria-label={`${itemLabel} community stats`}
      className="fixed z-50"
      style={style}
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--t-border)] px-3 py-2.5">
        <AggregateItemThumb
          row={row}
          frame={frame}
          displaySettings={displaySettings}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--t-text)]">
            {itemLabel}
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
              style={{ color: resolveBucketColor(topBucket, paletteId) }}
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
                  ? resolveBucketColor(avgBucket, paletteId)
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
              <strong
                style={{ color: resolveBucketColor(topBucket, paletteId) }}
              >
                {topBucket.label}
              </strong>{' '}
              tier ({formatPercent(row.topBucketShare)} of rankings).
            </>
          ) : (
            'No rankings yet.'
          )}
        </div>
      </div>
    </OverlayPanelSurface>
  )
}
