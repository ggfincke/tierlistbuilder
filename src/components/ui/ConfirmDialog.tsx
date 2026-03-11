// src/components/ui/ConfirmDialog.tsx
// modal confirmation dialog w/ cancel & destructive confirm actions
import { useEffect } from 'react'

interface ConfirmDialogProps {
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  // close on Escape — uses capture phase so it fires before parent bubble-phase
  // listeners (TierSettings, usePopupClose) & stops propagation to prevent
  // the parent from also closing
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onCancel])

  // render nothing when closed to keep the DOM clean
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#444] bg-[#1e1e1e] p-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm text-[#aaa]">{description}</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-[#555] px-3 py-1.5 text-sm text-slate-200 hover:border-[#777]"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
