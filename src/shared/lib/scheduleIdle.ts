// src/shared/lib/scheduleIdle.ts
// schedule background work after paint, w/ a setTimeout fallback

type IdleScheduler = (
  callback: () => void,
  options?: { timeout: number }
) => number

export const scheduleIdle = (callback: () => void, timeout = 2_000): void =>
{
  const idleScheduler = (
    window as unknown as { requestIdleCallback?: IdleScheduler }
  ).requestIdleCallback

  if (idleScheduler)
  {
    idleScheduler(callback, { timeout })
    return
  }

  setTimeout(callback, 0)
}
