// src/shared/ui/Button.tsx
// unified button primitive covering primary / secondary / action / overlay
// variants; named wrappers keep semantic call sites compact

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import {
  BUTTON_DISABLED_CLASS,
  BUTTON_FOCUS_CLASS,
} from '~/shared/ui/buttonBase'

export type ButtonVariant = 'primary' | 'secondary' | 'action' | 'overlay'
export type ButtonTone =
  | 'accent'
  | 'destructive'
  | 'neutral'
  | 'default'
  | 'success'
export type ButtonSize = 'xs' | 'sm' | 'md'
export type ButtonSurface = 'outline' | 'filled'
export type ButtonReveal = 'hover' | 'always'

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type'
>
{
  variant?: ButtonVariant
  tone?: ButtonTone
  size?: ButtonSize
  surface?: ButtonSurface
  reveal?: ButtonReveal
  active?: boolean
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

// -------- primary ------------------------------------------------------------

const PRIMARY_SIZE: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
}

const primaryToneClass = (tone: ButtonTone): string =>
{
  if (tone === 'destructive')
  {
    return 'bg-[var(--t-destructive)] text-[var(--t-destructive-foreground)] hover:bg-[var(--t-destructive-hover)]'
  }
  return 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)] hover:bg-[var(--t-accent-hover)]'
}

// -------- secondary ----------------------------------------------------------

const SECONDARY_SIZE: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-0.5 text-xs',
  sm: 'px-3 py-1 text-sm',
  md: 'px-3 py-1.5 text-sm',
}

const secondaryToneClass = (
  surface: ButtonSurface,
  tone: ButtonTone
): string =>
{
  if (surface === 'filled')
  {
    if (tone === 'destructive')
    {
      return 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-destructive-hover)] hover:border-[color-mix(in_srgb,var(--t-destructive)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)]'
    }
    return 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]'
  }
  if (tone === 'destructive')
  {
    return 'border-[var(--t-border-secondary)] text-[var(--t-destructive-hover)] hover:border-[color-mix(in_srgb,var(--t-destructive)_50%,transparent)]'
  }
  return 'border-[var(--t-border-secondary)] text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]'
}

// -------- action (circular icon) ---------------------------------------------

const actionChromeClass = (active: boolean): string =>
  active
    ? 'border-[rgb(var(--t-overlay)/0.22)] bg-[var(--t-bg-hover)] shadow-[inset_0_1px_0_rgba(var(--t-overlay),0.04),0_0_0_1px_rgba(var(--t-overlay),0.08)]'
    : 'border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-page)] hover:border-[rgb(var(--t-overlay)/0.22)] hover:bg-[var(--t-bg-hover)]'

// -------- overlay (always-dark item overlay) ---------------------------------

const OVERLAY_SIZE: Record<ButtonSize, string> = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
}

const overlayToneClass = (tone: ButtonTone): string =>
{
  if (tone === 'success') return 'hover:text-[var(--t-accent)]'
  if (tone === 'destructive') return 'hover:text-[var(--t-destructive-hover)]'
  return ''
}

const overlayRevealClass = (reveal: ButtonReveal): string =>
  reveal === 'hover'
    ? 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'
    : ''

// -------- dispatcher --------------------------------------------------------

const resolveClasses = (
  variant: ButtonVariant,
  tone: ButtonTone,
  size: ButtonSize,
  surface: ButtonSurface,
  reveal: ButtonReveal,
  active: boolean
): string =>
{
  if (variant === 'primary')
  {
    return joinClassNames(
      BUTTON_FOCUS_CLASS,
      'inline-flex items-center justify-center gap-1.5 rounded-md font-medium focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-overlay)]',
      BUTTON_DISABLED_CLASS,
      PRIMARY_SIZE[size],
      primaryToneClass(tone)
    )
  }

  if (variant === 'secondary')
  {
    return joinClassNames(
      BUTTON_FOCUS_CLASS,
      'inline-flex items-center justify-center gap-1.5 rounded-md border transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]',
      BUTTON_DISABLED_CLASS,
      SECONDARY_SIZE[size],
      secondaryToneClass(surface, tone)
    )
  }

  if (variant === 'action')
  {
    return joinClassNames(
      BUTTON_FOCUS_CLASS,
      'flex h-10 w-10 items-center justify-center rounded-[1.1rem] border text-[var(--t-text)] transition-none max-sm:h-11 max-sm:w-11 max-sm:rounded-[1.3rem] focus-visible:border-[rgb(var(--t-overlay)/0.22)] focus-visible:bg-[var(--t-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--t-overlay)/0.14)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-sunken)]',
      BUTTON_DISABLED_CLASS,
      actionChromeClass(active)
    )
  }

  // overlay — always-dark black circle; themed tokens do not apply here
  return joinClassNames(
    BUTTON_FOCUS_CLASS,
    'flex items-center justify-center rounded-full bg-black/70 text-white focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]',
    OVERLAY_SIZE[size],
    overlayToneClass(tone),
    overlayRevealClass(reveal)
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      tone = 'default',
      size,
      surface = 'outline',
      reveal = 'hover',
      active = false,
      type = 'button',
      children,
      ...props
    },
    ref
  ) =>
  {
    const resolvedSize: ButtonSize =
      size ??
      (variant === 'primary' ? 'sm' : variant === 'overlay' ? 'sm' : 'md')
    const resolvedTone: ButtonTone =
      tone === 'default' ? (variant === 'primary' ? 'accent' : 'default') : tone

    return (
      <button
        ref={ref}
        type={type}
        {...props}
        className={joinClassNames(
          resolveClasses(
            variant,
            resolvedTone,
            resolvedSize,
            surface,
            reveal,
            active
          ),
          className
        )}
      >
        {children as ReactNode}
      </button>
    )
  }
)

Button.displayName = 'Button'
