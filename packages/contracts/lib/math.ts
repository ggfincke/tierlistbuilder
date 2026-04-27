// packages/contracts/lib/math.ts
// shared numeric helpers for frontend & backend code

// clamp a value to the inclusive [min, max] range
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))
