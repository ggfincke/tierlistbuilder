// src/components/ui/ConfirmDialog.tsx
// modal confirmation dialog w/ cancel & destructive confirm actions

import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'

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
  useDismissibleLayer({
    open,
    onDismiss: onCancel,
    closeOnInteractOutside: false,
    escapePhase: 'capture',
    stopEscapePropagation: true,
  })

  // render nothing when closed to keep the DOM clean
  if (!open)
  {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-[var(--t-text)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--t-text-muted)]">{description}</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--t-border-secondary)] px-3 py-1.5 text-sm text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
              variant === 'accent'
                ? 'bg-[var(--t-accent)] hover:bg-[var(--t-accent-hover)]'
                : 'bg-[var(--t-destructive)] hover:bg-[var(--t-destructive-hover)]'
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
