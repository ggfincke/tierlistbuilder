// src/shared/ui/ActionButton.tsx
// reusable circular icon button for the board action bar

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import {
  BUTTON_DISABLED_CLASS,
  BUTTON_FOCUS_CLASS,
} from '~/shared/ui/buttonBase'

interface ActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'aria-haspopup'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-label'
  | 'title'
  | 'type'
  | 'children'
>
{
  // accessible label for screen readers
  label: string
  // tooltip text shown on hover
  title: string
  children: ReactNode
  // set to the popup role when the button toggles an overlay surface
  hasPopup?: 'dialog' | 'menu'
  // current open state of the associated popup (only used w/ hasPopup)
  expanded?: boolean
  controlsId?: string
  // keep the hover chrome visible while the related menu is open
  active?: boolean
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      label,
      title,
      children,
      hasPopup,
      expanded,
      controlsId,
      active = false,
      className,
      ...rest
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
        aria-controls={controlsId}
        aria-expanded={hasPopup ? expanded : undefined}
        {...rest}
        className={joinClassNames(
          BUTTON_FOCUS_CLASS,
          'flex h-10 w-10 items-center justify-center rounded-[1.1rem] border text-[var(--t-text)] transition-none max-sm:h-11 max-sm:w-11 max-sm:rounded-[1.3rem] focus-visible:border-[rgb(var(--t-overlay)/0.22)] focus-visible:bg-[var(--t-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--t-overlay)/0.14)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-sunken)]',
          BUTTON_DISABLED_CLASS,
          chromeClassName,
          className
        )}
      >
        {children}
      </button>
    )
  }
)

ActionButton.displayName = 'ActionButton'
