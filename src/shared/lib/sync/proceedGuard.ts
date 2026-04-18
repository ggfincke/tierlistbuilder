// src/shared/lib/sync/proceedGuard.ts
// shared gate for sync runners — returns true when no guard is set, else
// defers to the caller's shouldProceed()

export const makeProceedGuard =
  (shouldProceed?: () => boolean): (() => boolean) =>
  () =>
    shouldProceed ? shouldProceed() : true
