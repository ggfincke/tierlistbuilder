// src/features/platform/showcase/model/showcaseSaveScheduler.ts
// debounced profile-showcase saves w/ explicit route-exit flush

export interface ShowcaseSaveScheduler
{
  schedule: () => void
  flush: () => void
  cancel: () => void
}

export const createShowcaseSaveScheduler = (
  save: () => void,
  delayMs: number
): ShowcaseSaveScheduler =>
{
  let timeout: ReturnType<typeof setTimeout> | null = null
  let pending = false

  const clear = (): void =>
  {
    if (!timeout) return
    clearTimeout(timeout)
    timeout = null
  }

  const run = (): void =>
  {
    if (!pending) return
    clear()
    pending = false
    save()
  }

  return {
    schedule: () =>
    {
      pending = true
      clear()
      timeout = setTimeout(run, delayMs)
    },
    flush: run,
    cancel: () =>
    {
      clear()
      pending = false
    },
  }
}
