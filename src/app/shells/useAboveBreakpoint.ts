// src/app/shells/useAboveBreakpoint.ts
// reactive breakpoint check backed by a memoized MediaQueryList per breakpoint

import { useCallback, useSyncExternalStore } from 'react'

const mediaQueryCache = new Map<number, MediaQueryList>()
const mediaQuerySubscriberCounts = new Map<number, number>()

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
  mediaQuerySubscriberCounts.set(
    breakpoint,
    (mediaQuerySubscriberCounts.get(breakpoint) ?? 0) + 1
  )

  return () =>
  {
    mediaQuery.removeEventListener('change', onStoreChange)
    const nextCount = (mediaQuerySubscriberCounts.get(breakpoint) ?? 1) - 1
    if (nextCount > 0)
    {
      mediaQuerySubscriberCounts.set(breakpoint, nextCount)
      return
    }
    mediaQuerySubscriberCounts.delete(breakpoint)
    mediaQueryCache.delete(breakpoint)
  }
}

const getBreakpointSnapshot = (breakpoint: number): boolean =>
  getMediaQueryList(breakpoint)?.matches ?? true

// returns true when viewport width >= the given breakpoint (default 640 = Tailwind sm)
export const useAboveBreakpoint = (breakpoint = 640): boolean =>
{
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToBreakpoint(breakpoint, onStoreChange),
    [breakpoint]
  )
  const getSnapshot = useCallback(
    () => getBreakpointSnapshot(breakpoint),
    [breakpoint]
  )

  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
