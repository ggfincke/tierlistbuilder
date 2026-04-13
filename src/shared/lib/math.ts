// src/shared/lib/math.ts
// shared numeric helpers used across features

// clamp an index to the inclusive [min, max] range
export const clampIndex = (index: number, min: number, max: number): number =>
{
  return Math.max(min, Math.min(max, index))
}
