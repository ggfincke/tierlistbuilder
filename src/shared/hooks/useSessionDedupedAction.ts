// src/shared/hooks/useSessionDedupedAction.ts
// run a browser action once per sessionStorage key/value pair, plus an
// optional per-UTC-day localStorage gate that survives fresh-tab resets

import { useEffect, useRef } from 'react'

import {
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '~/shared/lib/browserStorage'

interface UseSessionDedupedActionOptions<TValue extends string>
{
  storageKey: string
  // optional localStorage key for the per-day gate; omit for session-only
  dailyStorageKey?: string
  value: TValue | null | undefined
  action: (value: TValue) => Promise<unknown>
  onError?: (error: unknown) => void
}

const MAX_RECORDED_VALUES = 256

const utcDayKey = (): string => new Date().toISOString().slice(0, 10)

const sessionRecordValue = (value: string, today: string | null): string =>
  today === null ? value : `${today}:${value}`

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

interface DailyRecord
{
  day: string
  values: string[]
}

// localStorage-backed per-day set; a day mismatch reads as empty so the gate
// self-expires every UTC day w/o leaking a key per recorded value
const readDailyRecordedValues = (
  storageKey: string,
  today: string
): Set<string> =>
{
  const raw = readBrowserStorageItem(storageKey)
  if (!raw) return new Set()

  try
  {
    const parsed = JSON.parse(raw)
    if (parsed?.day !== today || !Array.isArray(parsed.values))
    {
      return new Set()
    }
    return new Set(
      parsed.values.filter((entry: unknown) => typeof entry === 'string')
    )
  }
  catch
  {
    return new Set()
  }
}

const writeDailyRecordedValues = (
  storageKey: string,
  today: string,
  values: Set<string>
): void =>
{
  const entries = [...values]
  const trimmed =
    entries.length > MAX_RECORDED_VALUES
      ? entries.slice(entries.length - MAX_RECORDED_VALUES)
      : entries
  writeBrowserStorageItem(
    storageKey,
    JSON.stringify({ day: today, values: trimmed } satisfies DailyRecord)
  )
}

export const reserveSessionDedupedActionRun = ({
  storageKey,
  dailyStorageKey,
  value,
  today: todayOverride,
}: {
  storageKey: string
  dailyStorageKey?: string
  value: string
  today?: string
}): boolean =>
{
  const today = dailyStorageKey ? (todayOverride ?? utcDayKey()) : null
  const sessionValue = sessionRecordValue(value, today)
  const sessionRecorded = readRecordedValues(storageKey)
  if (sessionRecorded.has(sessionValue)) return false

  // per-day gate runs before the session write so a same-day fresh tab
  // short-circuits w/o ever firing the action
  const dayRecorded =
    dailyStorageKey && today
      ? readDailyRecordedValues(dailyStorageKey, today)
      : null
  if (dayRecorded?.has(value)) return false

  sessionRecorded.add(sessionValue)
  writeRecordedValues(storageKey, sessionRecorded)
  if (dailyStorageKey && today && dayRecorded)
  {
    dayRecorded.add(value)
    writeDailyRecordedValues(dailyStorageKey, today, dayRecorded)
  }
  return true
}

export const useSessionDedupedAction = <TValue extends string>({
  storageKey,
  dailyStorageKey,
  value,
  action,
  onError,
}: UseSessionDedupedActionOptions<TValue>): void =>
{
  // callers commonly pass inline closures; depending on them would re-run the
  // storage gate on every parent render. ref'd so the effect only fires when
  // the dedup key/value actually changes
  const actionRef = useRef(action)
  const onErrorRef = useRef(onError)
  useEffect(() =>
  {
    actionRef.current = action
    onErrorRef.current = onError
  })

  useEffect(() =>
  {
    if (!value) return

    if (
      !reserveSessionDedupedActionRun({
        storageKey,
        dailyStorageKey,
        value,
      })
    )
    {
      return
    }

    void actionRef.current(value).catch((error) =>
    {
      onErrorRef.current?.(error)
    })
  }, [dailyStorageKey, storageKey, value])
}
