// src/shared/lib/math.ts
// shared numeric helpers used across features

// clamp a value to the inclusive [min, max] range
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export const ceilToStep = (value: number, step: number, digits = 2): number =>
  Number((Math.ceil(value / step) * step).toFixed(digits))

export const floorToStep = (value: number, step: number, digits = 2): number =>
  Number((Math.floor(value / step) * step).toFixed(digits))

export const roundToStep = (value: number, step: number, digits = 2): number =>
  Number((Math.round(value / step) * step).toFixed(digits))

export const parsePercentInput = (value: string): number | null =>
{
  const normalized = value.trim().replace(/%$/, '')
  if (normalized.length === 0) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}
