// src/shared/lib/sync/backoff.ts
// shared exponential-backoff math for cloud sync runners — clamps the
// exponent to avoid overflow & caps the delay at RETRY_MAX_MS

// cap on a single retry wait. repeated transient failures shouldn't eat
// battery on an offline phone; 30s matches the board scheduler's original
export const RETRY_MAX_MS = 30_000

// compute the next retry delay. caller decides whether to bump
// retryAttempt afterwards — we read first so the first retry uses baseMs
export const computeBackoffDelay = (
  baseMs: number,
  retryAttempt: number
): number =>
{
  const exponent = Math.min(retryAttempt, 16)
  return Math.min(baseMs * 2 ** exponent, RETRY_MAX_MS)
}
