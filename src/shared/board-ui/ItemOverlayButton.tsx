// src/shared/board-ui/ItemOverlayButton.tsx
// dark item-overlay button wrapper over the unified Button primitive

import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { Button } from '~/shared/ui/Button'

interface ItemOverlayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  tone?: 'default' | 'success' | 'destructive'
  size?: 'xs' | 'sm'
  reveal?: 'hover' | 'always'
}

export const ItemOverlayButton = forwardRef<
  HTMLButtonElement,
  ItemOverlayButtonProps
>(({ tone = 'default', size = 'sm', reveal = 'hover', ...props }, ref) => (
  <Button
    ref={ref}
    variant="overlay"
    tone={tone}
    size={size}
    reveal={reveal}
    {...props}
  />
))

ItemOverlayButton.displayName = 'ItemOverlayButton'
