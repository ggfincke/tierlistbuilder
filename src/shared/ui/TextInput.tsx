// src/shared/ui/TextInput.tsx
// shared text input primitive for surfaced & inline text-entry fields

import { forwardRef, type InputHTMLAttributes } from 'react'

type TextInputVariant = 'surface' | 'ghost'
type TextInputSize = 'xs' | 'sm' | 'md'

interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
>
{
  size?: TextInputSize
  variant?: TextInputVariant
}

const SIZE_CLASS: Record<TextInputSize, string> = {
  xs: 'px-2 py-1.5 text-xs',
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
}

const VARIANT_CLASS: Record<TextInputVariant, string> = {
  surface:
    'border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] transition focus:border-[var(--t-border-hover)]',
  ghost:
    'bg-transparent text-[var(--t-text)] placeholder:text-[var(--t-text-faint)]',
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      className = '',
      size = 'sm',
      type = 'text',
      variant = 'surface',
      ...props
    },
    ref
  ) => (
    <input
      ref={ref}
      type={type}
      className={`focus-custom min-w-0 rounded-md outline-none disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  )
)

TextInput.displayName = 'TextInput'
