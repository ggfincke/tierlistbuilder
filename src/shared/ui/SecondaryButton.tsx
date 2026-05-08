// src/shared/ui/SecondaryButton.tsx
// named secondary button wrapper over the unified Button primitive

import type { ButtonHTMLAttributes, Ref } from 'react'

import { Button } from '~/shared/ui/Button'

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  variant?: 'outline' | 'surface'
  tone?: 'default' | 'destructive'
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}

export const SecondaryButton = ({
  variant = 'outline',
  tone = 'default',
  size = 'md',
  ref,
  ...props
}: SecondaryButtonProps) => (
  <Button
    ref={ref}
    variant="secondary"
    tone={tone}
    size={size}
    surface={variant === 'surface' ? 'filled' : 'outline'}
    {...props}
  />
)
