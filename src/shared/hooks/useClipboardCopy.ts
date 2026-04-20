// src/shared/hooks/useClipboardCopy.ts
// reusable clipboard copy hook w/ transient "copied" feedback state

import { useCallback, useEffect, useRef, useState } from 'react'

// default duration of the transient "copied" feedback state
export const COPIED_FEEDBACK_MS = 2000

export const useClipboardCopy = (timeoutMs = COPIED_FEEDBACK_MS) =>
{
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // clear any pending timer when the host component unmounts so we don't
  // setState on a destroyed component during the copy-feedback window
  useEffect(
    () => () =>
    {
      if (timerRef.current)
      {
        clearTimeout(timerRef.current)
      }
    },
    []
  )

  const copy = useCallback(
    async (text: string): Promise<boolean> =>
    {
      try
      {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), timeoutMs)
        return true
      }
      catch
      {
        return false
      }
    },
    [timeoutMs]
  )

  return { copied, copy }
}
