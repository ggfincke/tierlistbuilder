// src/shared/ui/SecondaryButton.tsx
// shared bordered button primitive for neutral secondary actions

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type SecondaryButtonVariant = 'outline' | 'surface'
type SecondaryButtonTone = 'default' | 'destructive'
type SecondaryButtonSize = 'sm' | 'md'

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  variant?: SecondaryButtonVariant
  tone?: SecondaryButtonTone
  size?: SecondaryButtonSize
}

const SIZE_CLASS: Record<SecondaryButtonSize, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-3 py-1.5 text-sm',
}

const getToneClass = (
  variant: SecondaryButtonVariant,
  tone: SecondaryButtonTone
) =>
{
  if (variant === 'surface')
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

export const SecondaryButton = forwardRef<
  HTMLButtonElement,
  SecondaryButtonProps
>(
  (
    {
      className = '',
      size = 'md',
      tone = 'default',
      type = 'button',
      variant = 'outline',
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={`focus-custom inline-flex items-center justify-center gap-1.5 rounded-md border transition disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${SIZE_CLASS[size]} ${getToneClass(variant, tone)} ${className}`}
      {...props}
    />
  )
)

SecondaryButton.displayName = 'SecondaryButton'
