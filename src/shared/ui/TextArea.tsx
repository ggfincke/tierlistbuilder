// src/shared/ui/TextArea.tsx
// shared multi-line text input primitive — mirrors TextInput's variant &
// size options so surfaces w/ mixed text inputs share one visual language

import { forwardRef, type TextareaHTMLAttributes } from 'react'

type TextAreaVariant = 'surface' | 'ghost'
type TextAreaSize = 'xs' | 'sm' | 'md'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>
{
  size?: TextAreaSize
  variant?: TextAreaVariant
}

const SIZE_CLASS: Record<TextAreaSize, string> = {
  xs: 'px-2 py-1.5 text-xs',
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
}

const VARIANT_CLASS: Record<TextAreaVariant, string> = {
  surface:
    'border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] transition focus:border-[var(--t-border-hover)]',
  ghost:
    'bg-transparent text-[var(--t-text)] placeholder:text-[var(--t-text-faint)]',
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className = '', size = 'sm', variant = 'surface', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`focus-custom min-w-0 rounded-md outline-none disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  )
)

TextArea.displayName = 'TextArea'
