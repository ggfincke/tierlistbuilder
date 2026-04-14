// src/shared/ui/ItemOverlayButton.tsx
// shared item-tile overlay action button for edit, restore, & delete affordances

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ItemOverlayButtonTone = 'default' | 'success' | 'destructive'
type ItemOverlayButtonSize = 'xs' | 'sm'
type ItemOverlayButtonReveal = 'hover' | 'always'

interface ItemOverlayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  tone?: ItemOverlayButtonTone
  size?: ItemOverlayButtonSize
  reveal?: ItemOverlayButtonReveal
}

const SIZE_CLASS: Record<ItemOverlayButtonSize, string> = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
}

const TONE_CLASS: Record<ItemOverlayButtonTone, string> = {
  default: '',
  success: 'hover:text-[var(--t-accent)]',
  destructive: 'hover:text-[var(--t-destructive-hover)]',
}

const REVEAL_CLASS: Record<ItemOverlayButtonReveal, string> = {
  hover:
    'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
  always: '',
}

export const ItemOverlayButton = forwardRef<
  HTMLButtonElement,
  ItemOverlayButtonProps
>(
  (
    {
      className = '',
      reveal = 'hover',
      size = 'sm',
      tone = 'default',
      type = 'button',
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={`focus-custom flex items-center justify-center rounded-full bg-black/70 text-white focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${REVEAL_CLASS[reveal]} ${className}`}
      {...props}
    />
  )
)

ItemOverlayButton.displayName = 'ItemOverlayButton'
