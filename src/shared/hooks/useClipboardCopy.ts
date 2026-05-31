// src/shared/hooks/useClipboardCopy.ts
// reusable clipboard copy hook w/ transient "copied" feedback state

import { useCallback, useEffect, useRef, useState } from 'react'

import { copyTextToClipboard } from '~/shared/lib/clipboard'

const COPIED_FEEDBACK_MS = 2000

const useCopyWithReset = <TValue>(idleValue: TValue, timeoutMs: number) =>
{
  const [activeValue, setActiveValue] = useState<TValue>(idleValue)
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

  const copyWithReset = useCallback(
    async (value: TValue, text: string): Promise<boolean> =>
    {
      const ok = await copyTextToClipboard(text)
      if (!ok) return false

      setActiveValue(value)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setActiveValue(idleValue), timeoutMs)
      return true
    },
    [idleValue, timeoutMs]
  )

  return { activeValue, copyWithReset }
}

export const useClipboardCopy = (timeoutMs = COPIED_FEEDBACK_MS) =>
{
  const { activeValue: copied, copyWithReset } = useCopyWithReset(
    false,
    timeoutMs
  )

  const copy = useCallback(
    async (text: string): Promise<boolean> => copyWithReset(true, text),
    [copyWithReset]
  )

  return { copied, copy }
}

export const useKeyedClipboardCopy = <TKey extends string>(
  timeoutMs = COPIED_FEEDBACK_MS
) =>
{
  const { activeValue: copiedKey, copyWithReset } =
    useCopyWithReset<TKey | null>(null, timeoutMs)

  const copyKey = useCallback(
    async (key: TKey, text: string): Promise<boolean> =>
      copyWithReset(key, text),
    [copyWithReset]
  )

  return { copiedKey, copyKey }
}
