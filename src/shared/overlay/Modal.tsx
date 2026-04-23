// src/shared/overlay/Modal.tsx
// modal chrome & overlay surface primitives: BaseModal, ConfirmDialog, ProgressOverlay, LazyModalSlot, menu/panel surfaces

import {
  forwardRef,
  Suspense,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

import { joinClassNames } from '~/shared/lib/className'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { useModalDialog } from './useModal'

// BaseModal — portal-mounted dialog shell w/ backdrop dismissal & focus management

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
  panelStyle?: CSSProperties
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
  panelStyle,
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
          style={panelStyle}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ModalHeader — canonical <h2> modal heading; callers own the surrounding wrapper

interface ModalHeaderProps
{
  titleId: string
  children: ReactNode
  className?: string
}

export const ModalHeader = ({
  titleId,
  children,
  className = 'text-lg font-semibold text-[var(--t-text)]',
}: ModalHeaderProps) => (
  <h2 id={titleId} className={className}>
    {children}
  </h2>
)

// DialogActions — right-aligned footer button row

interface DialogActionsProps
{
  children: ReactNode
  className?: string
}

export const DialogActions = ({
  children,
  className = 'mt-4 flex justify-end gap-2',
}: DialogActionsProps) => <div className={className}>{children}</div>

// ConfirmDialog — modal confirmation w/ cancel & destructive/accent confirm

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

// ProgressOverlay — blocking progress modal for long-running tasks

interface ProgressOverlayProps
{
  title: string
  statusVerb: string
  progressLabel: string
  current: number
  total: number
}

export const ProgressOverlay = ({
  title,
  statusVerb,
  progressLabel,
  current,
  total,
}: ProgressOverlayProps) =>
{
  const titleId = useId()
  const statusId = useId()

  if (total === 0)
  {
    return null
  }

  const pct = Math.round((current / total) * 100)

  return (
    <BaseModal
      open={true}
      labelledBy={titleId}
      describedBy={statusId}
      closeOnEscape={false}
      closeOnBackdrop={false}
      panelClassName="w-72 px-6 py-5 shadow-black/40"
    >
      <h2
        id={titleId}
        className="text-center text-sm font-semibold text-[var(--t-text)]"
      >
        {title}
      </h2>
      <p
        id={statusId}
        className="mt-1 text-center text-sm text-[var(--t-text-secondary)]"
        aria-live="polite"
      >
        {statusVerb}… {current} of {total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progressLabel}: ${pct}%`}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--t-bg-active)]"
      >
        <div
          className="h-full rounded-full bg-[var(--t-accent)] transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </BaseModal>
  )
}

// LazyModalSlot — gated Suspense + ErrorBoundary shell for lazy-loaded modals

interface LazyModalSlotProps<T>
{
  when: T | null | undefined | false
  section: string
  children: (trigger: NonNullable<T>) => ReactNode
}

export const LazyModalSlot = <T,>({
  when,
  section,
  children,
}: LazyModalSlotProps<T>) =>
{
  if (!when) return null

  return (
    <Suspense>
      <ErrorBoundary section={section}>
        {children(when as NonNullable<T>)}
      </ErrorBoundary>
    </Suspense>
  )
}

// overlay surface primitives: menu, panel, fixed popup, menu item, divider

interface OverlaySurfaceProps extends HTMLAttributes<HTMLDivElement>
{
  style?: CSSProperties
}

export const OverlayMenuSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={joinClassNames(
      'rounded-xl border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-overlay)] p-1.5 shadow-2xl',
      className
    )}
  />
))

OverlayMenuSurface.displayName = 'OverlayMenuSurface'

export const OverlayPanelSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={joinClassNames(
      'rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] shadow-2xl',
      className
    )}
  />
))

OverlayPanelSurface.displayName = 'OverlayPanelSurface'

export const OverlayFixedPopupSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={joinClassNames(
      'rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] shadow-lg',
      className
    )}
  />
))

OverlayFixedPopupSurface.displayName = 'OverlayFixedPopupSurface'

interface OverlayMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  children: ReactNode
}

export const OverlayMenuItem = ({
  children,
  className,
  type = 'button',
  ...props
}: OverlayMenuItemProps) => (
  <button
    type={type}
    {...props}
    className={joinClassNames(
      'focus-custom flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)] focus-visible:bg-[rgb(var(--t-overlay)/0.08)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)]',
      className
    )}
  >
    {children}
  </button>
)

export const OverlayDivider = ({ className }: { className?: string }) => (
  <div
    className={joinClassNames(
      'my-1 border-t border-[var(--t-border)]',
      className
    )}
  />
)
