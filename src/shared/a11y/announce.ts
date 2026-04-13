// src/shared/a11y/announce.ts
// module-level screen reader announcement system

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
