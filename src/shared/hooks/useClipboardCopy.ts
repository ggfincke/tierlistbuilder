// src/shared/hooks/useClipboardCopy.ts
// reusable clipboard copy hook w/ transient "copied" feedback state

import { useCallback, useRef, useState } from 'react'

export const useClipboardCopy = (timeoutMs = 2000) =>
{
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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
