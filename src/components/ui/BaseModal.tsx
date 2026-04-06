// src/components/ui/BaseModal.tsx
// shared modal shell for portal mounting, backdrop dismissal, & dialog chrome

import { useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { useModalDialog } from '../../hooks/useModalDialog'

interface BaseModalProps
{
  // controls whether the modal is mounted
  open: boolean
  // modal body content
  children: ReactNode
  // called when the modal should close
  onClose?: () => void
  // accessible label target for the dialog
  labelledBy?: string
  // accessible description target for the dialog
  describedBy?: string
  // fallback accessible label when no title id is available
  ariaLabel?: string
  // dialog role
  role?: 'dialog' | 'alertdialog'
  // preferred focus target when the modal opens
  initialFocusRef?: RefObject<HTMLElement | null>
  // whether focus should return to the opener on close
  restoreFocus?: boolean
  // whether Escape should dismiss the modal
  closeOnEscape?: boolean
  // whether backdrop clicks should dismiss the modal
  closeOnBackdrop?: boolean
  // event phase used for Escape dismissal
  escapePhase?: 'capture' | 'bubble'
  // whether the Escape handler should stop propagation
  stopEscapePropagation?: boolean
  // extra classes for the centering wrapper
  containerClassName?: string
  // extra classes for the backdrop
  backdropClassName?: string
  // extra classes for the dialog surface
  panelClassName?: string
}

const mergeClassName = (baseClassName: string, className?: string): string =>
  className ? `${baseClassName} ${className}` : baseClassName

export const BaseModal = ({
  open,
  children,
  onClose,
  labelledBy,
  describedBy,
  ariaLabel,
  role = 'dialog',
  initialFocusRef,
  restoreFocus = true,
  closeOnEscape = true,
  closeOnBackdrop = true,
  escapePhase = 'bubble',
  stopEscapePropagation = true,
  containerClassName,
  backdropClassName,
  panelClassName,
}: BaseModalProps) =>
{
  const dialogRef = useRef<HTMLDivElement>(null)

  useModalDialog({
    open,
    dialogRef,
    onClose,
    initialFocusRef,
    restoreFocus,
    closeOnEscape,
    escapePhase,
    stopEscapePropagation,
  })

  if (!open)
  {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        className={mergeClassName(
          'absolute inset-0 bg-black/60 animate-[fadeIn_100ms_ease-out]',
          backdropClassName
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        className={mergeClassName(
          'pointer-events-none absolute inset-0 flex items-center justify-center p-4',
          containerClassName
        )}
      >
        <div
          ref={dialogRef}
          role={role}
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          className={mergeClassName(
            'pointer-events-auto rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] shadow-2xl animate-[scaleIn_150ms_ease-out]',
            panelClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
