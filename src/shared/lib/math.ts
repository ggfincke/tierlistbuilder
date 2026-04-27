// src/shared/lib/math.ts
// shared numeric helpers used across features

export { clamp } from '@tierlistbuilder/contracts/lib/math'

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
