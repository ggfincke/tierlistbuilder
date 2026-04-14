// src/shared/a11y/announce.ts
// module-level screen reader announcement system

let announceFn: ((message: string) => void) | null = null

// register or clear the announcement callback (LiveRegion mounts & unmounts)
export const registerAnnouncer = (
  fn: ((message: string) => void) | null
): void =>
{
  announceFn = fn
}

// fire an announcement — callable from anywhere (hooks, store actions, etc.)
export const announce = (message: string): void =>
{
  announceFn?.(message)
}
