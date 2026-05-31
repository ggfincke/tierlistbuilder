// src/features/platform/sync/transport/connectivity.ts
// browser online/offline detection; mirrors navigator.onLine into syncStatusStore

import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'
import { logger } from '~/shared/lib/logger'

interface SetupConnectivityOptions
{
  onOnline: () => void
}

// navigator.onLine reflects the adapter (captive portals report online); the
// sync flush gate reads navigator directly because the store can lag real
// state if 'offline' fires between StrictMode listener mounts
export const readNavigatorOnline = (): boolean =>
  typeof navigator === 'undefined' ? true : navigator.onLine

export const setupConnectivity = (
  options: SetupConnectivityOptions
): (() => void) =>
{
  if (typeof window === 'undefined')
  {
    return () => undefined
  }

  const initialOnline = readNavigatorOnline()
  useSyncStatusStore.getState().setOnline(initialOnline)

  let lastSeenOnline = initialOnline

  const handleOnline = (): void =>
  {
    useSyncStatusStore.getState().setOnline(true)
    if (!lastSeenOnline)
    {
      lastSeenOnline = true
      try
      {
        options.onOnline()
      }
      catch (error)
      {
        logger.warn('sync', 'connectivity onOnline handler threw:', error)
      }
    }
  }

  const handleOffline = (): void =>
  {
    lastSeenOnline = false
    useSyncStatusStore.getState().setOnline(false)
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () =>
  {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
