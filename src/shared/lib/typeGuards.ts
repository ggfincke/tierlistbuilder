// src/shared/lib/typeGuards.ts
// shared runtime type guards used across persistence & validation paths

// narrow an unknown to a plain Record (object, not an array)
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
