// src/components/ui/ConfirmDialog.tsx
// modal confirmation dialog w/ cancel & destructive confirm actions

import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useModalBackgroundInert } from '../../hooks/useModalBackgroundInert'
import { SecondaryButton } from './SecondaryButton'

interface ConfirmDialogProps
{
  // controls dialog visibility
  open: boolean
  // bold heading shown at the top of the dialog
  title: string
  // supporting body text describing the consequences
  description: string
  // label for the confirm button (default: "Confirm")
  confirmText?: string
  // label for the cancel button (default: "Cancel")
  cancelText?: string
  // visual style of the confirm button (default: "destructive")
  variant?: 'destructive' | 'accent'
  // called when the user confirms the action
  onConfirm: () => void
  // called when the user cancels or closes the dialog
  onCancel: () => void
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'destructive',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) =>
{
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useDismissibleLayer({
    open,
    onDismiss: onCancel,
    closeOnInteractOutside: false,
    escapePhase: 'capture',
    stopEscapePropagation: true,
  })

  useFocusTrap(dialogRef, {
    active: open,
    initialFocusRef: cancelButtonRef,
  })
  useModalBackgroundInert(open)

  // render nothing when closed to keep the DOM clean
  if (!open)
  {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-[fadeIn_100ms_ease-out]">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl animate-[scaleIn_150ms_ease-out]"
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
          {title}
        </h2>
        <p
          id={descriptionId}
          className="mt-2 text-sm text-[var(--t-text-muted)]"
        >
          {description}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <SecondaryButton
            ref={cancelButtonRef}
            className="focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-overlay)]"
            onClick={onCancel}
          >
            {cancelText}
          </SecondaryButton>
          <button
            type="button"
            className={`focus-custom rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
              variant === 'accent'
                ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)] hover:bg-[var(--t-accent-hover)]'
                : 'bg-[var(--t-destructive)] text-[var(--t-destructive-foreground)] hover:bg-[var(--t-destructive-hover)]'
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
