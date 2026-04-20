// src/shared/ui/SecondaryButton.tsx
// shim — forwards to the unified Button w/ variant='secondary'

import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { Button } from '~/shared/ui/Button'

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  variant?: 'outline' | 'surface'
  tone?: 'default' | 'destructive'
  size?: 'sm' | 'md'
}

export const SecondaryButton = forwardRef<
  HTMLButtonElement,
  SecondaryButtonProps
>(({ variant = 'outline', tone = 'default', size = 'md', ...props }, ref) => (
  <Button
    ref={ref}
    variant="secondary"
    tone={tone}
    size={size}
    surface={variant === 'surface' ? 'filled' : 'outline'}
    {...props}
  />
))

SecondaryButton.displayName = 'SecondaryButton'
