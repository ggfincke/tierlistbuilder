// src/features/library/ui/cards/TierPills.tsx
// discrete per-tier item-count pills for board cards — the editorial
// counterpart to TierBar's continuous fill. overflow collapses into +N

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

import { resolveTierColorSpec } from '~/shared/theme/tierColors'

interface TierPillsProps
{
  board: Pick<LibraryBoardListItem, 'paletteId' | 'tierBreakdown'>
  // hard cap on rendered pills; the remainder collapses into a +N pill
  max?: number
}

export const TierPills = ({ board, max = 6 }: TierPillsProps) =>
{
  const filled = board.tierBreakdown.filter((tier) => tier.itemCount > 0)
  if (filled.length === 0)
  {
    return (
      <span
        className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]"
        style={{ fontFamily: 'var(--ts-mono)' }}
      >
        Unranked
      </span>
    )
  }

  const shown = filled.slice(0, max)
  const overflow = filled.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((tier) => (
        <span
          key={tier.tierIndex}
          className="inline-flex items-center gap-1 rounded-[3px] bg-[rgb(var(--t-overlay)/0.06)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--t-text-secondary)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-[2px]"
            style={{
              backgroundColor: resolveTierColorSpec(
                board.paletteId,
                tier.colorSpec
              ),
            }}
          />
          {tier.itemCount}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="text-[9px] text-[var(--t-text-faint)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
