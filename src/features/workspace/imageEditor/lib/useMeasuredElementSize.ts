// src/features/workspace/imageEditor/lib/useMeasuredElementSize.ts
// ResizeObserver-backed element measurement for fixed-format editor previews

import { useEffect, useState, type RefObject } from 'react'

export interface ElementSize
{
  width: number
  height: number
}

export const useMeasuredElementSize = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  fallback: ElementSize
): ElementSize =>
{
  const fallbackWidth = fallback.width
  const fallbackHeight = fallback.height
  const [size, setSize] = useState(() => ({
    width: fallbackWidth,
    height: fallbackHeight,
  }))

  useEffect(() =>
  {
    const element = ref.current
    if (!element)
    {
      return
    }

    const update = () =>
    {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      setSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 &&
        Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height }
      )
    }

    update()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fallbackWidth, fallbackHeight])

  return size
}
