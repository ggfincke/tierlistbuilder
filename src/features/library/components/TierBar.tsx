// src/features/library/components/TierBar.tsx
// horizontal progress bar segmented by tier; unranked items fill the tail

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

import { resolveTierColor } from '~/features/library/lib/resolveTierColor'

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

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex flex-1 overflow-hidden rounded-full bg-[rgb(var(--t-overlay)/0.06)]"
        style={{ height }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={board.rankedItemCount}
        aria-label={`Ranked ${board.rankedItemCount} of ${total} items`}
      >
        {board.tierBreakdown.map((tier) =>
        {
          if (tier.itemCount <= 0) return null
          const widthPct = (tier.itemCount / total) * 100
          return (
            <div
              key={tier.tierIndex}
              style={{
                width: `${widthPct}%`,
                backgroundColor: resolveTierColor(
                  tier.colorSpec,
                  board.paletteId
                ),
              }}
              title={`Tier ${tier.tierIndex + 1}: ${tier.itemCount}`}
            />
          )
        })}
      </div>
      {showCount && (
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[rgb(var(--t-overlay)/0.5)]">
          {board.rankedItemCount} / {total}
        </span>
      )}
    </div>
  )
}
