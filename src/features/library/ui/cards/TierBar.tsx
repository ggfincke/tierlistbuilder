// src/features/library/ui/cards/TierBar.tsx
// horizontal progress bar segmented by tier; unranked items fill the tail

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

import { clamp } from '~/shared/lib/math'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'

interface TierBarProps
{
  // wire-shape board row — uses paletteId + tierBreakdown from the projection
  board: Pick<
    LibraryBoardListItem,
    'paletteId' | 'tierBreakdown' | 'rankedItemCount' | 'activeItemCount'
  >
  height?: number
  // when true, render the "ranked / total" caption to the right of the bar
  showCount?: boolean
}

export const TierBar = ({
  board,
  height = 4,
  showCount = true,
}: TierBarProps) =>
{
  const total = board.activeItemCount

  if (total === 0)
  {
    return (
      <div className="flex items-center gap-2">
        <div
          className="flex-1 overflow-hidden rounded-full bg-[rgb(var(--t-overlay)/0.06)]"
          style={{ height }}
          aria-hidden="true"
        />
        {showCount && (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[rgb(var(--t-overlay)/0.4)]">
            0 / 0
          </span>
        )}
      </div>
    )
  }

  const ranked = clamp(board.rankedItemCount, 0, total)
  // sum may diverge from `ranked` when the cached breakdown is capped (see
  // LIBRARY_BOARD_TIER_LIMIT) or stale — scale segments against the breakdown
  // sum so colored fill always lands at exactly ranked/total of the track.
  const breakdownSum = board.tierBreakdown.reduce(
    (acc, tier) => acc + Math.max(0, tier.itemCount),
    0
  )
  const rankedPct = (ranked / total) * 100

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex flex-1 overflow-hidden rounded-full bg-[rgb(var(--t-overlay)/0.06)]"
        style={{ height }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ranked}
        aria-label={`Ranked ${ranked} of ${total} items`}
      >
        {breakdownSum > 0 &&
          board.tierBreakdown.map((tier) =>
          {
            if (tier.itemCount <= 0) return null
            const widthPct = (tier.itemCount / breakdownSum) * rankedPct
            return (
              <div
                key={tier.tierIndex}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: resolveTierColorSpec(
                    board.paletteId,
                    tier.colorSpec
                  ),
                }}
                title={`Tier ${tier.tierIndex + 1}: ${tier.itemCount}`}
              />
            )
          })}
      </div>
      {showCount && (
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[rgb(var(--t-overlay)/0.5)]">
          {ranked} / {total}
        </span>
      )}
    </div>
  )
}
