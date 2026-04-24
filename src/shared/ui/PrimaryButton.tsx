// src/shared/ui/PrimaryButton.tsx
// named primary button wrapper over the unified Button primitive

import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { Button, type ButtonTone } from '~/shared/ui/Button'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  tone?: Extract<ButtonTone, 'accent' | 'destructive'>
  size?: 'sm' | 'md'
}

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  ({ tone = 'accent', size = 'sm', ...props }, ref) => (
    <Button ref={ref} variant="primary" tone={tone} size={size} {...props} />
  )
)

PrimaryButton.displayName = 'PrimaryButton'
