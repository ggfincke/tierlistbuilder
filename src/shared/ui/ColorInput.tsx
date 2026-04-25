// src/shared/ui/ColorInput.tsx
// shared <input type="color"> primitive — themed border & sizing

import { forwardRef, type InputHTMLAttributes } from 'react'

import { joinClassNames } from '~/shared/lib/className'

type ColorInputSize = 'sm' | 'md'

interface ColorInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
>
{
  size?: ColorInputSize
}

const SIZE_CLASS: Record<ColorInputSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
}

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  ({ className, size = 'sm', ...props }, ref) => (
    <input
      ref={ref}
      type="color"
      className={joinClassNames(
        'shrink-0 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent',
        SIZE_CLASS[size],
        className
      )}
      {...props}
    />
  )
)

ColorInput.displayName = 'ColorInput'
