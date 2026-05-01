// tests/platform/boardSyncStatus.test.ts
// per-board sync status derivation

import { describe, expect, it } from 'vitest'
import { resolveBoardSyncStatus } from '~/features/platform/sync/state/syncStatusStore'

describe('resolveBoardSyncStatus', () =>
{
  it('reports offline for dirty boards, conflict overrides offline, idle stays idle, & online passes through', () =>
  {
    expect(
      resolveBoardSyncStatus({
        online: false,
        storedStatus: 'idle',
        hasConflict: false,
      })
    ).toBe('idle')

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

    expect(
      resolveBoardSyncStatus({
        online: false,
        storedStatus: 'syncing',
        hasConflict: true,
      })
    ).toBe('conflict')

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
