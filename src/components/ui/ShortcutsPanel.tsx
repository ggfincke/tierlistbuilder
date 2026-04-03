// src/components/ui/ShortcutsPanel.tsx
// floating overlay listing all keyboard shortcuts

import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useModalBackgroundInert } from '../../hooks/useModalBackgroundInert'
import { SHORTCUTS } from '../../utils/shortcuts'

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

        <div className="space-y-2.5">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-sm text-[var(--t-text-secondary)]">
                {shortcut.description}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--t-text)]"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

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
