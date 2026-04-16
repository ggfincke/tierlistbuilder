// src/features/workspace/settings/ui/DeletedItemsSection.tsx
// recently deleted items grid w/ restore & permanent delete actions

import { useState } from 'react'
import { RotateCcw, Trash2, X } from 'lucide-react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { ItemOverlayButton } from '~/shared/ui/ItemOverlayButton'

export const DeletedItemsSection = () =>
{
  const deletedItems = useActiveBoardStore((state) => state.deletedItems)
  const restoreDeletedItem = useActiveBoardStore(
    (state) => state.restoreDeletedItem
  )
  const permanentlyDeleteItem = useActiveBoardStore(
    (state) => state.permanentlyDeleteItem
  )
  const clearDeletedItems = useActiveBoardStore(
    (state) => state.clearDeletedItems
  )
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  if (deletedItems.length === 0)
  {
    return null
  }

  return (
    <>
      <section className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--t-text)]">
            Recently Deleted
            <span className="ml-1.5 font-normal text-[var(--t-text-faint)]">
              ({deletedItems.length})
            </span>
          </h3>
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 text-xs text-[var(--t-text-faint)] hover:text-[var(--t-destructive-hover)]"
          >
            <Trash2 className="h-3 w-3" />
            Clear all
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {deletedItems.map((item) => (
            <div
              key={item.id}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded opacity-70"
            >
              <ItemContent item={item} variant="compact" />
              {/* hover overlay — restore (bottom-left) & permanent delete (top-right) */}
              <div className="absolute inset-0 flex items-end justify-start bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <ItemOverlayButton
                  aria-label={`Restore ${item.label ?? 'item'}`}
                  reveal="always"
                  tone="success"
                  className="rounded-tr-md bg-black/60"
                  onClick={() => restoreDeletedItem(item.id)}
                >
                  <RotateCcw className="h-3 w-3" />
                </ItemOverlayButton>
              </div>
              <ItemOverlayButton
                aria-label={`Permanently delete ${item.label ?? 'item'}`}
                tone="destructive"
                size="xs"
                className="absolute right-0.5 top-0.5"
                onClick={() => permanentlyDeleteItem(item.id)}
              >
                <X className="h-2.5 w-2.5" />
              </ItemOverlayButton>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear deleted items?"
        description="This will permanently remove all deleted items. This cannot be undone."
        confirmText="Clear all"
        onConfirm={() =>
        {
          clearDeletedItems()
          setShowClearConfirm(false)
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  )
}
