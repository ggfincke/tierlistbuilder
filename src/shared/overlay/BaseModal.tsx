// src/shared/overlay/BaseModal.tsx
// shared modal shell for portal mounting, backdrop dismissal, & dialog chrome

import { useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { joinClassNames } from '@/shared/lib/className'
import { useModalDialog } from './useModalDialog'

interface BaseModalProps
{
  open: boolean
  children: ReactNode
  onClose?: () => void
  labelledBy?: string
  describedBy?: string
  ariaLabel?: string
  role?: 'dialog' | 'alertdialog'
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocus?: boolean
  closeOnEscape?: boolean
  closeOnBackdrop?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
  containerClassName?: string
  backdropClassName?: string
  panelClassName?: string
}

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
        className={joinClassNames(
          'absolute inset-0 bg-black/60 animate-[fadeIn_100ms_ease-out]',
          backdropClassName
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        className={joinClassNames(
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
          className={joinClassNames(
            'pointer-events-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] shadow-2xl animate-[scaleIn_150ms_ease-out]',
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
