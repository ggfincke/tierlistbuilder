// src/shared/a11y/LiveRegion.tsx
// visually-hidden ARIA live region for screen reader announcements

import { useCallback, useEffect, useRef, useState } from 'react'

import { registerAnnouncer } from './announce'

// short delay so the empty-string reset commits to the DOM before the new
// text is set — without it, repeated identical messages wouldn't re-announce
const ANNOUNCEMENT_DELAY_MS = 50

export const LiveRegion = () =>
{
  const [message, setMessage] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleAnnounce = useCallback((text: string) =>
  {
    setMessage('')

    if (timeoutRef.current)
    {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() =>
    {
      setMessage(text)
    }, ANNOUNCEMENT_DELAY_MS)
  }, [])

  useEffect(() =>
  {
    registerAnnouncer(handleAnnounce)
    return () =>
    {
      registerAnnouncer(null)
      if (timeoutRef.current)
      {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [handleAnnounce])

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}
