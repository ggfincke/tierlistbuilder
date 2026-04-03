// src/components/ui/LiveRegion.tsx
// visually-hidden ARIA live region for screen reader announcements

import { useCallback, useEffect, useRef, useState } from 'react'

import { registerAnnouncer } from '../../utils/announce'

export const LiveRegion = () =>
{
  const [message, setMessage] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleAnnounce = useCallback((text: string) =>
  {
    // clear previous message first so repeated identical messages are re-announced
    setMessage('')

    if (timeoutRef.current)
    {
      clearTimeout(timeoutRef.current)
    }

    // set message on next tick so the live region picks up the change
    timeoutRef.current = setTimeout(() =>
    {
      setMessage(text)
    }, 50)
  }, [])

  useEffect(() =>
  {
    registerAnnouncer(handleAnnounce)
    return () =>
    {
      if (timeoutRef.current)
      {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [handleAnnounce])

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}
