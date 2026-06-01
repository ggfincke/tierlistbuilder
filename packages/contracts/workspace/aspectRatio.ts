// packages/contracts/workspace/aspectRatio.ts
// aspect-ratio math mirrored by scripts/seed_pipeline/seed_pipeline/crop.py

import { clamp } from '../lib/math'
import { isPositiveFiniteNumber } from '../lib/typeGuards'

// relative difference within this fraction treats two ratios as equal; tuned
// to absorb rounding & codec variance (e.g. 1000x1500 vs 1001x1500) without
// letting obviously different ratios (4:3 vs 1:1) collapse into one bucket
export const ASPECT_RATIO_TOLERANCE = 0.02
export const BOARD_ITEM_ASPECT_RATIO_MAX = 4
export const BOARD_ITEM_ASPECT_RATIO_MIN = 1 / BOARD_ITEM_ASPECT_RATIO_MAX

export interface AspectRatioPreset
{
  label: string
  width: number
  height: number
  value: number
}

const buildPreset = (width: number, height: number): AspectRatioPreset => ({
  label: `${width}:${height}`,
  width,
  height,
  value: width / height,
})

export const ASPECT_RATIO_PRESETS: readonly AspectRatioPreset[] = [
  buildPreset(1, 1),
  buildPreset(2, 3),
  buildPreset(3, 4),
  buildPreset(3, 2),
  buildPreset(4, 3),
  buildPreset(16, 9),
  buildPreset(9, 16),
]

// two ratios are considered equal when their relative difference is within tol
export const ratiosMatch = (
  a: number,
  b: number,
  tol = ASPECT_RATIO_TOLERANCE
): boolean =>
{
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0)
  {
    return false
  }
  const max = Math.max(a, b)
  return Math.abs(a - b) / max <= tol
}

interface AspectRatioValueBucket<T>
{
  representative: number
  count: number
  ratios: number[]
  values: T[]
}

const medianOf = (values: readonly number[]): number =>
{
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

// group values by ratio tolerance; each bucket's representative is the median
// of its member ratios. returned sorted by bucket size desc
export const bucketValuesByAspectRatio = <T>(
  values: readonly T[],
  getRatio: (value: T) => number | null | undefined,
  tol = ASPECT_RATIO_TOLERANCE
): AspectRatioValueBucket<T>[] =>
{
  const buckets: { ratios: number[]; values: T[] }[] = []
  for (const value of values)
  {
    const ratio = getRatio(value)
    if (!isPositiveFiniteNumber(ratio)) continue
    let placed = false
    for (const bucket of buckets)
    {
      if (ratiosMatch(ratio, bucket.ratios[0], tol))
      {
        bucket.ratios.push(ratio)
        bucket.values.push(value)
        placed = true
        break
      }
    }
    if (!placed) buckets.push({ ratios: [ratio], values: [value] })
  }
  return buckets
    .map((bucket) => ({
      representative: medianOf(bucket.ratios),
      count: bucket.ratios.length,
      ratios: bucket.ratios,
      values: bucket.values,
    }))
    .sort((a, b) => b.count - a.count)
}

export const majorityAspectRatio = (
  ratios: readonly number[],
  tol = ASPECT_RATIO_TOLERANCE
): number | null =>
{
  const buckets = bucketValuesByAspectRatio(ratios, (ratio) => ratio, tol)
  return buckets[0]?.representative ?? null
}

export const findMatchingPreset = (
  value: number,
  tol = ASPECT_RATIO_TOLERANCE
): AspectRatioPreset | undefined =>
  ASPECT_RATIO_PRESETS.find((preset) => ratiosMatch(preset.value, value, tol))

export const normalizeBoardItemAspectRatio = (
  value: unknown
): number | undefined =>
  isPositiveFiniteNumber(value)
    ? clamp(value, BOARD_ITEM_ASPECT_RATIO_MIN, BOARD_ITEM_ASPECT_RATIO_MAX)
    : undefined
