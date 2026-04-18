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

// narrow an unknown to a strictly-positive finite number — guards millisecond
// timestamps & other positive-only counters against NaN/Infinity/0/negative
export const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
