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
  // keep the hover chrome visible while the related menu is open
  active?: boolean
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      label,
      title,
      onClick,
      disabled = false,
      children,
      hasPopup,
      expanded,
      active = false,
    },
    ref
  ) =>
  {
    const chromeClassName = active
      ? 'border-[rgb(var(--t-overlay)/0.22)] bg-[var(--t-bg-hover)] shadow-[inset_0_1px_0_rgba(var(--t-overlay),0.04),0_0_0_1px_rgba(var(--t-overlay),0.08)]'
      : 'border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-page)] hover:border-[rgb(var(--t-overlay)/0.22)] hover:bg-[var(--t-bg-hover)]'

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={title}
        aria-haspopup={hasPopup}
        aria-expanded={hasPopup ? expanded : undefined}
        disabled={disabled}
        onClick={onClick}
        className={`focus-custom flex h-10 w-10 items-center justify-center rounded-[1.1rem] border max-sm:h-11 max-sm:w-11 max-sm:rounded-[1.3rem] text-[var(--t-text)] transition-none focus-visible:border-[rgb(var(--t-overlay)/0.22)] focus-visible:bg-[var(--t-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--t-overlay)/0.14)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-sunken)] disabled:cursor-not-allowed disabled:opacity-45 ${chromeClassName}`}
      >
        {children}
      </button>
    )
  }
)
