// src/components/board/ItemEditPopover.tsx
// popover for editing item alt text

import { useCallback, useEffect, useRef, useState } from 'react'

import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useTierListStore } from '../../store/useTierListStore'

const POPOVER_GAP = 6
const POPOVER_HEIGHT = 140
const POPOVER_WIDTH = 224
const VIEWPORT_MARGIN = 8

interface ItemEditPopoverProps
{
  itemId: string
  anchorRect: DOMRect
  onClose: () => void
}

export const ItemEditPopover = ({
  itemId,
  anchorRect,
  onClose,
}: ItemEditPopoverProps) =>
{
  const item = useTierListStore((s) => s.items[itemId])
  const setItemAltText = useTierListStore((s) => s.setItemAltText)

  const [altText, setAltText] = useState(item?.altText ?? '')
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClose = useCallback(() =>
  {
    if (item)
    {
      const trimmedAlt = altText.trim()
      if ((trimmedAlt || '') !== (item.altText || ''))
      {
        setItemAltText(itemId, trimmedAlt)
      }
    }
    onClose()
  }, [item, altText, itemId, setItemAltText, onClose])

  useDismissibleLayer({
    open: true,
    layerRef: popoverRef,
    onDismiss: handleClose,
    closeOnEscape: true,
    closeOnInteractOutside: true,
    stopEscapePropagation: true,
  })

  // auto-focus input on open
  useEffect(() =>
  {
    inputRef.current?.focus()
  }, [])

  if (!item) return null

  // position below the item, clamped to viewport
  const top = Math.min(anchorRect.bottom + POPOVER_GAP, window.innerHeight - POPOVER_HEIGHT)
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH))

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-56 rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] p-3 shadow-lg"
      style={{ top, left }}
    >
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-faint)]">
        Alt Text
      </label>
      <input
        ref={inputRef}
        type="text"
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        placeholder="Alt text for screen readers..."
        maxLength={200}
        className="w-full rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2 py-1.5 text-xs text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] outline-none focus:border-[var(--t-border-hover)]"
      />

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={handleClose}
          className="focus-custom rounded-md bg-[var(--t-bg-active)] px-2.5 py-1 text-xs font-medium text-[var(--t-text)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          Done
        </button>
      </div>
    </div>
  )
}
