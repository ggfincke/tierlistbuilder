// src/features/workspace/boards/ui/board-chrome/BulkActionBar.tsx
// floating bar shown when items are selected — bulk move, delete, & clear selection

import { ArrowRight, Trash2, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import {
  selectIsDragging,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useTierMoveTargets } from '~/features/workspace/boards/ui/shared/useTierMoveTargets'

export const BulkActionBar = () =>
{
  const {
    selectedCount,
    isDragging,
    moveSelectedToTier,
    moveSelectedToUnranked,
    deleteSelectedItems,
    clearSelection,
  } = useActiveBoardStore(
    useShallow((state) => ({
      selectedCount: state.selection.ids.length,
      isDragging: selectIsDragging(state),
      moveSelectedToTier: state.moveSelectedToTier,
      moveSelectedToUnranked: state.moveSelectedToUnranked,
      deleteSelectedItems: state.deleteSelectedItems,
      clearSelection: state.clearSelection,
    }))
  )
  const tiers = useTierMoveTargets()
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)

  if (selectedCount === 0 || isDragging) return null

  return (
    <div
      data-bulk-action-bar
      className={`fixed z-40 left-1/2 -translate-x-1/2 rounded-2xl border border-[rgb(var(--t-overlay)/0.18)] bg-[var(--t-bg-overlay)] px-4 py-2.5 shadow-xl ${reducedMotion ? '' : 'animate-[fadeIn_120ms_ease-out]'}`}
      style={{ bottom: `max(1.5rem, env(safe-area-inset-bottom, 0px))` }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[var(--t-text)]">
          {selectedCount} selected
        </span>

        <div className="h-4 w-px bg-[var(--t-border)]" />

        <div className="flex items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5 text-[var(--t-text-faint)]" />
          {tiers.map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => moveSelectedToTier(tier.id)}
              className="rounded-md px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: tier.color, color: tier.textColor }}
              title={`Move to ${tier.name}`}
            >
              {tier.name}
            </button>
          ))}
          <button
            type="button"
            onClick={moveSelectedToUnranked}
            className="rounded-md bg-[var(--t-bg-surface)] px-2 py-0.5 text-xs text-[var(--t-text-secondary)] transition-colors hover:bg-[var(--t-bg-hover)]"
            title="Move to unranked"
          >
            Unranked
          </button>
        </div>

        <div className="h-4 w-px bg-[var(--t-border)]" />

        <button
          type="button"
          onClick={deleteSelectedItems}
          className="rounded-md p-1 text-[var(--t-text-faint)] transition-colors hover:text-[var(--t-destructive)]"
          title="Delete selected"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={clearSelection}
          className="rounded-md p-1 text-[var(--t-text-faint)] transition-colors hover:text-[var(--t-text)]"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
