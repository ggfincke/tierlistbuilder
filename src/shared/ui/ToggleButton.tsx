// src/shared/ui/ToggleButton.tsx
// small pressed-state button for segmented chips & toolbar formatting toggles

import type { ComponentProps, ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

type ToggleButtonSize = 'chip' | 'icon'
type ToggleButtonVariant = 'accent' | 'subtle'

interface ToggleButtonProps extends Omit<
  ComponentProps<'button'>,
  'type' | 'children'
>
{
  active: boolean
  children: ReactNode
  size?: ToggleButtonSize
  variant?: ToggleButtonVariant
}

const SIZE_CLASS: Record<ToggleButtonSize, string> = {
  chip: 'rounded px-2 py-0.5 text-[11px]',
  icon: 'rounded p-1.5',
}

const ACTIVE_CLASS: Record<ToggleButtonVariant, string> = {
  accent: 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]',
  subtle: 'bg-[rgb(var(--t-overlay)/0.12)] text-[var(--t-text)]',
}

const INACTIVE_CLASS: Record<ToggleButtonVariant, string> = {
  accent: 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)]',
  subtle:
    'text-[var(--t-text-secondary)] hover:bg-[rgb(var(--t-overlay)/0.06)]',
}

export const ToggleButton = ({
  active,
  children,
  className,
  size = 'chip',
  variant = 'accent',
  ...props
}: ToggleButtonProps) => (
  <button
    {...props}
    type="button"
    aria-pressed={active}
    className={joinClassNames(
      'focus-custom transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed',
      SIZE_CLASS[size],
      active ? ACTIVE_CLASS[variant] : INACTIVE_CLASS[variant],
      className
    )}
  >
    {children}
  </button>
)
