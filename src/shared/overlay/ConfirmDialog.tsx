// src/shared/overlay/ConfirmDialog.tsx
// alert dialog for destructive or accent confirmations

import { useId, useRef } from 'react'

import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { BaseModal } from './BaseModal'
import { DialogActions } from './DialogActions'
import { ModalHeader } from './ModalHeader'

interface ConfirmDialogProps
{
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'destructive' | 'accent'
  onConfirm: () => void
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
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={cancelButtonRef}
      closeOnBackdrop={false}
      escapePhase="capture"
      panelClassName="w-full max-w-sm p-4"
    >
      <ModalHeader titleId={titleId}>{title}</ModalHeader>
      <p id={descriptionId} className="mt-2 text-sm text-[var(--t-text-muted)]">
        {description}
      </p>

      <DialogActions>
        <SecondaryButton
          ref={cancelButtonRef}
          className="focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-overlay)]"
          onClick={onCancel}
        >
          {cancelText}
        </SecondaryButton>
        <PrimaryButton tone={variant} onClick={onConfirm}>
          {confirmText}
        </PrimaryButton>
      </DialogActions>
    </BaseModal>
  )
}
