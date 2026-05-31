// src/shared/a11y/announce.ts
// module-level screen reader announcement system

type Announcer = (message: string) => void

const announcers: Announcer[] = []

const getActiveAnnouncer = (): Announcer | undefined =>
  announcers[announcers.length - 1]

export const registerAnnouncer = (fn: Announcer): (() => void) =>
{
  announcers.push(fn)
  return () =>
  {
    const index = announcers.lastIndexOf(fn)
    if (index >= 0) announcers.splice(index, 1)
  }
}

// fire an announcement — callable from anywhere (hooks, store actions, etc.)
export const announce = (message: string): void =>
{
  getActiveAnnouncer()?.(message)
}
