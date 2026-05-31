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

export const assertStringLength = (
  field: string,
  value: string | null | undefined,
  maxLength: number,
  formatMessage?: (args: {
    field: string
    length: number
    maxLength: number
  }) => string
): void =>
{
  const length = value?.length ?? 0
  if (length > maxLength)
  {
    failInput(
      formatMessage?.({ field, length, maxLength }) ??
        `${field} too long: ${length} exceeds ${maxLength}`
    )
  }
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
  assertStringLength(
    field,
    value,
    maxLength,
    ({ field, maxLength }) => `${field} must be at most ${maxLength} characters`
  )
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
  assertStringLength(field, value, maxLength)
  return value
}
