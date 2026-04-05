// src/components/ui/ShortcutsPanel.tsx
// floating overlay listing all keyboard shortcuts

import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useModalBackgroundInert } from '../../hooks/useModalBackgroundInert'
import { ShortcutsList } from './ShortcutsList'

interface ShortcutsPanelProps
{
  onClose: () => void
}

export const ShortcutsPanel = ({ onClose }: ShortcutsPanelProps) =>
{
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useDismissibleLayer({
    open: true,
    layerRef: panelRef,
    onDismiss: onClose,
    closeOnEscape: true,
    closeOnInteractOutside: true,
    stopEscapePropagation: true,
  })

  useFocusTrap(panelRef, {
    active: true,
    initialFocusRef: closeButtonRef,
  })
  useModalBackgroundInert(true)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-[fadeIn_100ms_ease-out]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-5 shadow-2xl animate-[scaleIn_150ms_ease-out]"
      >
        <h2
          id={titleId}
          className="mb-4 text-lg font-semibold text-[var(--t-text)]"
        >
          Keyboard Shortcuts
        </h2>

        <ShortcutsList />

        <div className="mt-5 flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="focus-custom rounded-md bg-[var(--t-bg-active)] px-3 py-1.5 text-sm font-medium text-[var(--t-text)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
