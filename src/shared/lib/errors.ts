// src/shared/lib/errors.ts
// shared error-to-message helpers

const getConvexDataMessage = (error: unknown): string | null =>
{
  if (typeof error !== 'object' || error === null || !('data' in error))
  {
    return null
  }

  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null || !('message' in data))
  {
    return null
  }

  const message = (data as { message?: unknown }).message
  return typeof message === 'string' && message.trim() ? message : null
}

export const formatError = (
  err: unknown,
  fallback: string = 'Unknown error'
): string =>
{
  const convexMessage = getConvexDataMessage(err)
  if (convexMessage) return convexMessage
  if (err instanceof Error) return err.message.trim() ? err.message : fallback
  if (typeof err === 'string') return err
  if (err === null || err === undefined) return fallback
  return String(err)
}

export const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError'
