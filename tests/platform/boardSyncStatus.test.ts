import { describe, expect, it } from 'vitest'
import { resolveBoardSyncStatus } from '~/features/platform/sync/status/syncStatusStore'

describe('board sync status', () =>
{
  it('keeps fully idle boards idle while offline', () =>
  {
    expect(
      resolveBoardSyncStatus({
        online: false,
        storedStatus: 'idle',
        hasConflict: false,
      })
    ).toBe('idle')
  })

  it('reports offline for dirty boards while disconnected', () =>
  {
    expect(
      resolveBoardSyncStatus({
        online: false,
        storedStatus: 'syncing',
        hasConflict: false,
      })
    ).toBe('offline')

    expect(
      resolveBoardSyncStatus({
        online: false,
        storedStatus: 'error',
        hasConflict: false,
      })
    ).toBe('offline')
  })

  it('keeps conflicts visible even while offline', () =>
  {
    expect(
      resolveBoardSyncStatus({
        online: false,
        storedStatus: 'syncing',
        hasConflict: true,
      })
    ).toBe('conflict')
  })

  it('passes through online per-board states when connected', () =>
  {
    expect(
      resolveBoardSyncStatus({
        online: true,
        storedStatus: 'syncing',
        hasConflict: false,
      })
    ).toBe('syncing')

    expect(
      resolveBoardSyncStatus({
        online: true,
        storedStatus: 'error',
        hasConflict: false,
      })
    ).toBe('error')
  })
})
