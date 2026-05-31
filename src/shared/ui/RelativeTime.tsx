// src/shared/ui/RelativeTime.tsx
// live-updating relative-time text - clock is seeded on mount (so the first
// paint is correct, not "today"); tests pass `now` to stay deterministic

import { useEffect, useState } from 'react'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'

interface RelativeTimeProps
{
  ts: number
  // override the live clock for tests; absent -> seed from Date.now() on mount
  now?: number
}

const TICK_MS = 60_000

export const RelativeTime = ({ ts, now: nowOverride }: RelativeTimeProps) =>
{
  const [now, setNow] = useState<number>(() => nowOverride ?? Date.now())
  useEffect(() =>
  {
    if (nowOverride !== undefined) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [nowOverride])
  return (
    <time
      dateTime={Number.isFinite(ts) ? new Date(ts).toISOString() : undefined}
      suppressHydrationWarning
    >
      {formatRelativeTime(ts, now)}
    </time>
  )
}
