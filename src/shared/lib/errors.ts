// src/shared/lib/errors.ts
// shared error-to-message helpers

export const formatError = (
  err: unknown,
  fallback: string = 'Unknown error'
): string =>
{
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err === null || err === undefined) return fallback
  return String(err)
}
