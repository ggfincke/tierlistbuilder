// src/shared/hooks/useSessionDedupedAction.ts
// run a browser action once per sessionStorage key/value pair

import { useEffect } from 'react'

interface UseSessionDedupedActionOptions<TValue extends string>
{
  storageKey: string
  value: TValue | null | undefined
  action: (value: TValue) => Promise<unknown>
  onError?: (error: unknown) => void
}

const MAX_RECORDED_VALUES = 256

const readRecordedValues = (storageKey: string): Set<string> =>
{
  if (typeof window === 'undefined') return new Set()

  try
  {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return new Set()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()

    return new Set(parsed.filter((entry) => typeof entry === 'string'))
  }
  catch
  {
    return new Set()
  }
}

const writeRecordedValues = (storageKey: string, values: Set<string>): void =>
{
  if (typeof window === 'undefined') return

  try
  {
    const entries = [...values]
    const trimmed =
      entries.length > MAX_RECORDED_VALUES
        ? entries.slice(entries.length - MAX_RECORDED_VALUES)
        : entries
    window.sessionStorage.setItem(storageKey, JSON.stringify(trimmed))
  }
  catch
  {
    return
  }
}

export const useSessionDedupedAction = <TValue extends string>({
  storageKey,
  value,
  action,
  onError,
}: UseSessionDedupedActionOptions<TValue>): void =>
{
  useEffect(() =>
  {
    if (!value) return

    const recorded = readRecordedValues(storageKey)
    if (recorded.has(value)) return

    recorded.add(value)
    writeRecordedValues(storageKey, recorded)

    void action(value).catch((error) =>
    {
      onError?.(error)
    })
  }, [action, onError, storageKey, value])
}
