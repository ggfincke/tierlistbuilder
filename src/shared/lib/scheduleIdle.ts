// src/shared/lib/scheduleIdle.ts
// schedule background work after paint, w/ a setTimeout fallback

export const scheduleIdle = (callback: () => void, timeout = 2_000): void =>
{
  if (typeof window.requestIdleCallback === 'function')
  {
    window.requestIdleCallback(callback, { timeout })
    return
  }

  setTimeout(callback, 0)
}
