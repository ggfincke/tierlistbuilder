// src/components/comparison/DiffSummary.tsx
// summary panel showing promoted/demoted/unchanged counts & notable changes

import { memo } from 'react'
import { ArrowDown, ArrowUp, Equal, Minus, Plus } from 'lucide-react'

import type { BoardDiff } from '../../domain/boardDiff'

interface DiffSummaryProps
{
  diff: BoardDiff
}

export const DiffSummary = memo(({ diff }: DiffSummaryProps) =>
{
  const notableChanges = diff.entries
    .filter((e) => e.change !== 'unchanged')
    .slice(0, 8)

  return (
    <div className="mb-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-4 py-3">
      {/* stat badges */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1 text-green-400">
          <ArrowUp className="h-3 w-3" />
          {diff.promoted} promoted
        </span>
        <span className="flex items-center gap-1 text-red-400">
          <ArrowDown className="h-3 w-3" />
          {diff.demoted} demoted
        </span>
        <span className="flex items-center gap-1 text-[var(--t-text-muted)]">
          <Equal className="h-3 w-3" />
          {diff.unchanged} unchanged
        </span>
        {diff.addedToB.length > 0 && (
          <span className="flex items-center gap-1 text-blue-400">
            <Plus className="h-3 w-3" />
            {diff.addedToB.length} added
          </span>
        )}
        {diff.removedFromB.length > 0 && (
          <span className="flex items-center gap-1 text-[var(--t-text-faint)]">
            <Minus className="h-3 w-3" />
            {diff.removedFromB.length} removed
          </span>
        )}
      </div>

      {/* notable changes list */}
      {notableChanges.length > 0 && (
        <div className="mt-2 space-y-1">
          {notableChanges.map((entry) => (
            <div
              key={`${entry.itemIdA}-${entry.itemIdB}`}
              className="flex items-center gap-2 text-xs"
            >
              {entry.change === 'promoted' ? (
                <ArrowUp className="h-3 w-3 shrink-0 text-green-400" />
              ) : (
                <ArrowDown className="h-3 w-3 shrink-0 text-red-400" />
              )}
              <span className="truncate text-[var(--t-text-secondary)]">
                {entry.label}
              </span>
              <span className="shrink-0 text-[var(--t-text-faint)]">
                {entry.tierNameA} → {entry.tierNameB}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
