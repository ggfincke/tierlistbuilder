// convex/lib/text.ts
// shared text normalization helpers for Convex input validators

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export const failInput = (message: string): never =>
{
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidInput,
    message,
  })
}

export const normalizeRequiredText = (
  raw: string,
  maxLength: number,
  field: string
): string =>
{
  const value = raw.trim()
  if (!value)
  {
    failInput(`${field} cannot be empty`)
  }
  if (value.length > maxLength)
  {
    failInput(`${field} must be at most ${maxLength} characters`)
  }
  return value
}

export const normalizeNullableText = (
  raw: string | null | undefined,
  maxLength: number,
  field: string
): string | null =>
{
  const value = raw?.trim() ?? ''
  if (!value)
  {
    return null
  }
  if (value.length > maxLength)
  {
    failInput(`${field} too long: ${value.length} exceeds ${maxLength}`)
  }
  return value
}
