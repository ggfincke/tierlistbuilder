// convex/lib/retry.ts
// shared helpers for retry loops that need to wait or classify convex runtime errors

// error markers are matched against runtime messages — if convex rewords any,
// callers silently stop retrying, so keep all classifiers in one place
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const isConvexWriteThrottleError = (error: unknown): boolean =>
{
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Too many concurrent commits') ||
    message.includes('Too many writes per second') ||
    message.includes('bytes written per 1 second')
  )
}

export const isConvexOccError = (error: unknown): boolean =>
{
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('changed while this mutation was being run')
}
