// src/features/platform/sync/lib/connectivity.ts
// browser online/offline detection — mirrors navigator.onLine into syncStatusStore
// & invokes onOnline on offline -> online transitions to re-queue pending boards

import { useSyncStatusStore } from '../status/syncStatusStore'

interface SetupConnectivityOptions
{
  // fires once per offline -> online transition (not on initial install,
  // even if we boot online). consumer should re-queue pending boards here
  onOnline: () => void
}

const readNavigatorOnline = (): boolean =>
{
  if (typeof navigator === 'undefined')
  {
    return true
  }
  // navigator.onLine is "the browser thinks the network adapter is up." it's
  // not a real connectivity probe — false positives (captive portals, etc)
  // happen, & a flush failure is the real signal — but pairing both is ok
  return navigator.onLine
}

export const setupConnectivity = (
  options: SetupConnectivityOptions
): (() => void) =>
{
  if (typeof window === 'undefined')
  {
    // SSR / non-browser env — leave the store at its default (online: true)
    // & return a no-op disposer
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
