// src/features/platform/sync/transport/connectivity.ts
// browser online/offline detection; mirrors navigator.onLine into syncStatusStore

import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'

interface SetupConnectivityOptions
{
  onOnline: () => void
}

const readNavigatorOnline = (): boolean =>
{
  if (typeof navigator === 'undefined')
  {
    return true
  }
  // navigator.onLine reflects the adapter, not real connectivity (captive
  // portals still report online); flush failures are the authoritative signal
  return navigator.onLine
}

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
        console.warn('connectivity onOnline handler threw:', error)
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
