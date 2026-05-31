// src/features/marketplace/model/formatters.ts
// marketplace-specific error message formatting

import { formatError } from '~/shared/lib/errors'

export const formatMarketplaceError = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => formatError(error, fallback)
