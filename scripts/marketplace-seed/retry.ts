// scripts/marketplace-seed/retry.ts
// retry helpers for transient Convex seed action failures

import {
  SEED_ACTION_MAX_ATTEMPTS,
  SEED_ACTION_RETRY_BASE_MS,
} from './constants'
import { sleep } from './env'

const isTransientActionError = (error: unknown): boolean =>
{
  const message = error instanceof Error ? error.message : String(error)
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
    message
  )
}

export const runActionWithRetry = async <T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> =>
{
  let lastError: unknown
  for (let attempt = 1; attempt <= SEED_ACTION_MAX_ATTEMPTS; attempt++)
  {
    try
    {
      return await fn()
    }
    catch (error)
    {
      lastError = error
      if (
        attempt === SEED_ACTION_MAX_ATTEMPTS ||
        !isTransientActionError(error)
      )
      {
        throw error
      }
      const delay = SEED_ACTION_RETRY_BASE_MS * 2 ** (attempt - 1)
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(
        `    .. ${label} transient error (attempt ${attempt}/${SEED_ACTION_MAX_ATTEMPTS}): ${message} - retrying in ${delay}ms\n`
      )
      await sleep(delay)
    }
  }
  throw lastError
}
