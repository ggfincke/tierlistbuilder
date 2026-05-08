// src/shared/ui/PrimaryButton.tsx
// named primary button wrapper over the unified Button primitive

import type { ButtonHTMLAttributes, Ref } from 'react'

import { Button, type ButtonTone } from '~/shared/ui/Button'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  tone?: Extract<ButtonTone, 'accent' | 'destructive'>
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}

export const PrimaryButton = ({
  tone = 'accent',
  size = 'sm',
  ref,
  ...props
}: PrimaryButtonProps) => (
  <Button ref={ref} variant="primary" tone={tone} size={size} {...props} />
)
