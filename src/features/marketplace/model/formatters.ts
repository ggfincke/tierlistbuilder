// src/features/marketplace/model/formatters.ts
// marketplace-specific error message formatting

export const formatMarketplaceError = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string =>
  error instanceof Error && error.message.trim() ? error.message : fallback
