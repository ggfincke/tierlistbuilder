// src/components/ui/BulkActionBar.tsx
// floating bar shown when items are selected — bulk move, delete, & clear selection

import { ArrowRight, Trash2, X } from 'lucide-react'

import { useTierListStore } from '../../store/useTierListStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { getTextColor } from '../../utils/color'

export const BulkActionBar = () =>
{
  const selectedCount = useTierListStore((state) => state.selectedItemIds.size)
  const tiers = useTierListStore((state) => state.tiers)
  const moveSelectedToTier = useTierListStore(
    (state) => state.moveSelectedToTier
  )
  const moveSelectedToUnranked = useTierListStore(
    (state) => state.moveSelectedToUnranked
  )
  const deleteSelectedItems = useTierListStore(
    (state) => state.deleteSelectedItems
  )
  const clearSelection = useTierListStore((state) => state.clearSelection)
  const reducedMotion = useSettingsStore((state) => state.reducedMotion)
  const paletteId = useCurrentPaletteId()

  if (selectedCount === 0) return null

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-2xl border border-[rgb(var(--t-overlay)/0.18)] bg-[var(--t-bg-overlay)] px-4 py-2.5 shadow-xl ${reducedMotion ? '' : 'animate-[fadeIn_120ms_ease-out]'}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[var(--t-text)]">
          {selectedCount} selected
        </span>

        <div className="h-4 w-px bg-[var(--t-border)]" />

        {/* move to tier buttons */}
        <div className="flex items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5 text-[var(--t-text-faint)]" />
          {tiers.map((tier) =>
          {
            const bg = resolveTierColorSpec(paletteId, tier.colorSpec)
            const fg = getTextColor(bg)
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => moveSelectedToTier(tier.id)}
                className="rounded-md px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: bg, color: fg }}
                title={`Move to ${tier.name}`}
              >
                {tier.name}
              </button>
            )
          })}
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
