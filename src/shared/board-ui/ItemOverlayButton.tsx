// src/shared/board-ui/ItemOverlayButton.tsx
// dark item-overlay button wrapper over the unified Button primitive

import type { ButtonHTMLAttributes, Ref } from 'react'

import { Button } from '~/shared/ui/Button'

interface ItemOverlayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  tone?: 'default' | 'success' | 'destructive'
  size?: 'xs' | 'sm'
  reveal?: 'hover' | 'always'
  ref?: Ref<HTMLButtonElement>
}

export const ItemOverlayButton = ({
  tone = 'default',
  size = 'sm',
  reveal = 'hover',
  ref,
  ...props
}: ItemOverlayButtonProps) => (
  <Button
    ref={ref}
    variant="overlay"
    tone={tone}
    size={size}
    reveal={reveal}
    {...props}
  />
)
