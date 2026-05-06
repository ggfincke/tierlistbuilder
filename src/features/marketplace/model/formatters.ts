// src/features/marketplace/model/formatters.ts
// marketplace-specific error message formatting

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

export const formatMarketplaceError = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string =>
  getConvexDataMessage(error) ??
  (error instanceof Error && error.message.trim() ? error.message : fallback)
