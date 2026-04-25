// src/shared/lib/proceedGuard.ts
// guard async continuations behind an optional liveness predicate

export const makeProceedGuard =
  (shouldProceed?: () => boolean): (() => boolean) =>
  () =>
    shouldProceed?.() ?? true
