// src/shared/ui/PrimaryButton.tsx
// shared accent / destructive button — used for confirm dialogs & save actions

import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import {
  BUTTON_DISABLED_CLASS,
  BUTTON_FOCUS_CLASS,
} from '~/shared/ui/buttonBase'

type PrimaryButtonTone = 'accent' | 'destructive'
type PrimaryButtonSize = 'sm' | 'md'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  tone?: PrimaryButtonTone
  size?: PrimaryButtonSize
}

const SIZE_CLASS: Record<PrimaryButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
}

const TONE_CLASS: Record<PrimaryButtonTone, string> = {
  accent:
    'bg-[var(--t-accent)] text-[var(--t-accent-foreground)] hover:bg-[var(--t-accent-hover)]',
  destructive:
    'bg-[var(--t-destructive)] text-[var(--t-destructive-foreground)] hover:bg-[var(--t-destructive-hover)]',
}

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  (
    { className, size = 'sm', tone = 'accent', type = 'button', ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={joinClassNames(
        BUTTON_FOCUS_CLASS,
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-overlay)]',
        BUTTON_DISABLED_CLASS,
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className
      )}
      {...props}
    />
  )
)

PrimaryButton.displayName = 'PrimaryButton'
