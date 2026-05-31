// src/shared/ui/IconButton.tsx
// square icon button — secondary idle chrome that brightens to full text on
// hover. shared across template hero actions, share, & print controls

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

export type IconButtonSize = 'md' | 'lg'

const ICON_BUTTON_SIZE: Record<IconButtonSize, string> = {
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
}

const ICON_BUTTON_BASE =
  'focus-custom inline-flex shrink-0 items-center justify-center rounded-md ' +
  'border border-[var(--t-border)] bg-[var(--t-bg-surface)] ' +
  'text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] ' +
  'hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type'
>
{
  size?: IconButtonSize
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', type = 'button', className, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      {...props}
      className={joinClassNames(
        ICON_BUTTON_BASE,
        ICON_BUTTON_SIZE[size],
        className
      )}
    >
      {children as ReactNode}
    </button>
  )
)

IconButton.displayName = 'IconButton'
