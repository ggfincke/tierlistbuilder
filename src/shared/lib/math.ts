// src/shared/lib/math.ts
// shared numeric helpers used across features

// clamp a value to the inclusive [min, max] range
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

// clamp an index to the inclusive [min, max] range — alias retained so
// existing imports stay stable while the codebase migrates to `clamp`
export const clampIndex = clamp
