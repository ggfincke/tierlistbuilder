// src/shared/hooks/useViewportWidth.ts
// reactive breakpoint check backed by a memoized MediaQueryList per breakpoint

import { useSyncExternalStore } from 'react'

const mediaQueryCache = new Map<number, MediaQueryList>()

const getMediaQueryList = (breakpoint: number): MediaQueryList | null =>
{
  if (typeof window === 'undefined')
  {
    return null
  }

  const cachedQuery = mediaQueryCache.get(breakpoint)
  if (cachedQuery)
  {
    return cachedQuery
  }

  const nextQuery = window.matchMedia(`(min-width: ${breakpoint}px)`)
  mediaQueryCache.set(breakpoint, nextQuery)
  return nextQuery
}

const subscribeToBreakpoint = (
  breakpoint: number,
  onStoreChange: () => void
) =>
{
  const mediaQuery = getMediaQueryList(breakpoint)
  if (!mediaQuery)
  {
    return () => undefined
  }

  mediaQuery.addEventListener('change', onStoreChange)

  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

const getBreakpointSnapshot = (breakpoint: number): boolean =>
  getMediaQueryList(breakpoint)?.matches ?? true

// returns true when viewport width >= the given breakpoint (default 640 = Tailwind sm)
export const useAboveBreakpoint = (breakpoint = 640): boolean =>
  useSyncExternalStore(
    (onStoreChange) => subscribeToBreakpoint(breakpoint, onStoreChange),
    () => getBreakpointSnapshot(breakpoint),
    () => true
  )
