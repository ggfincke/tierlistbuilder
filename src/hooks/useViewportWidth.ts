// src/hooks/useViewportWidth.ts
// reactive breakpoint check — fires only when crossing the threshold

import { useEffect, useState } from 'react'

// returns true when viewport width >= the given breakpoint (default 640 = Tailwind sm)
export const useAboveBreakpoint = (breakpoint = 640): boolean =>
{
  const mql =
    typeof window !== 'undefined'
      ? window.matchMedia(`(min-width: ${breakpoint}px)`)
      : null

  const [above, setAbove] = useState(mql?.matches ?? true)

  useEffect(() =>
  {
    if (!mql) return
    const handler = (e: MediaQueryListEvent) => setAbove(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mql])

  return above
}
