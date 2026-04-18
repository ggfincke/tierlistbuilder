// src/shared/lib/sync/offlineError.ts
// shared offline-sentinel error used by cloud sync runners to short-circuit
// before issuing a doomed network call & to suppress onError noise

export const OFFLINE_SENTINEL = 'offline'

export const makeOfflineError = (): Error => new Error(OFFLINE_SENTINEL)

export const isOfflineError = (error: unknown): boolean =>
  error instanceof Error && error.message === OFFLINE_SENTINEL
