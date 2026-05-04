// src/shared/lib/typeGuards.ts
// shared runtime type guards used across persistence & validation paths

// narrow an unknown to a plain Record (object, not an array)
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

// narrow out null & undefined — useful in .filter(isPresent) so TS drops
// the | undefined from arr.map(id => map[id])
export const isPresent = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined

// narrow an unknown to a non-empty string
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

export { isPositiveFiniteNumber } from '@tierlistbuilder/contracts/lib/typeGuards'

// membership check on a branded-string array vs a plain string. centralizes
// the cast so call sites keep the brand at their surface
export const brandedStringArrayIncludes = <T extends string>(
  arr: readonly T[],
  value: string
): boolean => (arr as readonly string[]).includes(value)

// indexOf equivalent for branded-string arrays against a plain string
export const brandedStringArrayIndexOf = <T extends string>(
  arr: readonly T[],
  value: string
): number => (arr as readonly string[]).indexOf(value)
