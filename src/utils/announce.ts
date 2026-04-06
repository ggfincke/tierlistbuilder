// src/utils/announce.ts
// module-level screen reader announcement system

import { UNRANKED_CONTAINER_ID } from './constants'

let announceFn: ((message: string) => void) | null = null

// called by LiveRegion on mount to register the announcement callback
export const registerAnnouncer = (fn: (message: string) => void) =>
{
  announceFn = fn
}

// fire an announcement — callable from anywhere (hooks, store actions, etc.)
export const announce = (message: string) =>
{
  announceFn?.(message)
}

// build a human-readable container label for drop announcements
export const getContainerLabel = (
  containerId: string | null | undefined,
  tiers: { id: string; name: string }[]
): string =>
{
  if (containerId === UNRANKED_CONTAINER_ID) return 'unranked pool'
  return tiers.find((t) => t.id === containerId)?.name ?? 'tier'
}
