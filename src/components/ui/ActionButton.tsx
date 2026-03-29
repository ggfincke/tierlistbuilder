// src/components/ui/ActionButton.tsx
// reusable circular icon button for the board action bar

import { forwardRef, type ReactNode } from 'react'

interface ActionButtonProps
{
  // accessible label for screen readers
  label: string
  // tooltip text shown on hover
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  // set to "menu" when the button toggles a popup menu
  hasPopup?: 'menu'
  // current open state of the associated popup (only used w/ hasPopup)
  expanded?: boolean
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { label, title, onClick, disabled = false, children, hasPopup, expanded },
    ref
  ) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={title}
      aria-haspopup={hasPopup}
      aria-expanded={hasPopup ? expanded : undefined}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-page)] text-[var(--t-text)] transition hover:border-[rgb(var(--t-overlay)/0.22)] hover:bg-[var(--t-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  )
)
