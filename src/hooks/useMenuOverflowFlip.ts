// src/hooks/useMenuOverflowFlip.ts
// flips a submenu to the opposite horizontal side when it overflows the viewport

import { useCallback } from 'react'

// pre-split CSS classes to position the submenu on the opposite side
const FLIP_LEFT = [
  'right-[calc(100%+0.375rem)]',
  'left-auto',
  'before:-right-2',
  'before:left-auto',
  'before:top-0',
  'before:h-full',
  'before:w-2',
]
const FLIP_RIGHT = [
  'left-[calc(100%+0.375rem)]',
  'right-auto',
  'before:-left-2',
  'before:right-auto',
  'before:top-0',
  'before:h-full',
  'before:w-2',
]

export const useMenuOverflowFlip = () =>
{
  // callback ref — measures on mount & applies flip imperatively
  const ref = useCallback((node: HTMLDivElement | null) =>
  {
    if (!node) return

    const rect = node.getBoundingClientRect()

    if (rect.right > window.innerWidth)
    {
      node.classList.add(...FLIP_LEFT)
      return
    }

    if (rect.left < 0)
    {
      node.classList.add(...FLIP_RIGHT)
    }
  }, [])

  return { ref }
}
