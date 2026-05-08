// src/shared/hooks/useClipboardCopy.ts
// reusable clipboard copy hook w/ transient "copied" feedback state

import { useCallback, useEffect, useRef, useState } from 'react'

import { copyTextToClipboard } from '~/shared/lib/clipboard'

const COPIED_FEEDBACK_MS = 2000

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
      const ok = await copyTextToClipboard(text)
      if (!ok) return false

      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), timeoutMs)
      return true
    },
    [timeoutMs]
  )

  return { copied, copy }
}

export const useKeyedClipboardCopy = <TKey extends string>(
  timeoutMs = COPIED_FEEDBACK_MS
) =>
{
  const [copiedKey, setCopiedKey] = useState<TKey | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

  const copyKey = useCallback(
    async (key: TKey, text: string): Promise<boolean> =>
    {
      const ok = await copyTextToClipboard(text)
      if (!ok) return false

      setCopiedKey(key)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopiedKey(null), timeoutMs)
      return true
    },
    [timeoutMs]
  )

  return { copiedKey, copyKey }
}
