// tests/shared-hooks/useSessionDedupedAction.test.ts
// Storage gate coverage for once-per-session & once-per-UTC-day actions.

import { describe, expect, it, vi } from 'vitest'
import { reserveSessionDedupedActionRun } from '~/shared/hooks/useSessionDedupedAction'
import { createMemoryStorage } from '@tests/shared-lib/memoryStorage'

const stubSessionStorage = (): Storage =>
{
  const sessionStorage = createMemoryStorage()
  vi.stubGlobal('window', { sessionStorage })
  return sessionStorage
}

describe('reserveSessionDedupedActionRun', () =>
{
  it('dedupes session-only actions by raw value', () =>
  {
    const sessionStorage = stubSessionStorage()

    expect(
      reserveSessionDedupedActionRun({
        storageKey: 'session-only',
        value: 'template-slug',
      })
    ).toBe(true)
    expect(
      reserveSessionDedupedActionRun({
        storageKey: 'session-only',
        value: 'template-slug',
      })
    ).toBe(false)
    expect(JSON.parse(sessionStorage.getItem('session-only') ?? '[]')).toEqual([
      'template-slug',
    ])
  })

  it('scopes session records to the UTC day when the daily gate is enabled', () =>
  {
    const sessionStorage = stubSessionStorage()

    expect(
      reserveSessionDedupedActionRun({
        storageKey: 'session-daily',
        dailyStorageKey: 'daily',
        value: 'template-slug',
        today: '2026-05-14',
      })
    ).toBe(true)
    expect(
      reserveSessionDedupedActionRun({
        storageKey: 'session-daily',
        dailyStorageKey: 'daily',
        value: 'template-slug',
        today: '2026-05-14',
      })
    ).toBe(false)
    expect(
      reserveSessionDedupedActionRun({
        storageKey: 'session-daily',
        dailyStorageKey: 'daily',
        value: 'template-slug',
        today: '2026-05-15',
      })
    ).toBe(true)

    expect(JSON.parse(sessionStorage.getItem('session-daily') ?? '[]')).toEqual(
      ['2026-05-14:template-slug', '2026-05-15:template-slug']
    )
    expect(JSON.parse(localStorage.getItem('daily') ?? '{}')).toEqual({
      day: '2026-05-15',
      values: ['template-slug'],
    })
  })
})
