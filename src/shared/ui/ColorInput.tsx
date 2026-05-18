// src/shared/ui/ColorInput.tsx
// shared <input type="color"> primitive — themed border & sizing

import type { InputHTMLAttributes, Ref } from 'react'

import { joinClassNames } from '~/shared/lib/className'

type ColorInputSize = 'sm' | 'md'

interface ColorInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
>
{
  size?: ColorInputSize
  ref?: Ref<HTMLInputElement>
}

const SIZE_CLASS: Record<ColorInputSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
}

export const ColorInput = ({
  className,
  size = 'sm',
  ref,
  ...props
}: ColorInputProps) => (
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
