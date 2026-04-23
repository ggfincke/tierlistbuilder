// src/features/workspace/boards/lib/aspectRatio.ts
// aspect-ratio bucketing, matching, & board-level mismatch detection

import type {
  BoardSnapshot,
  ImageFit,
  ItemAspectRatioMode,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'

// relative difference within this fraction treats two ratios as equal; tuned
// to absorb rounding & codec variance (e.g. 1000x1500 vs 1001x1500) without
// letting obviously different ratios (4:3 vs 1:1) collapse into one bucket
export const ASPECT_RATIO_TOLERANCE = 0.02

export const DEFAULT_ITEM_ASPECT_RATIO = 1

export interface AspectRatioPreset
{
  // short display label ("1:1", "2:3")
  label: string
  width: number
  height: number
  // decimal value (width / height)
  value: number
}

const preset = (width: number, height: number): AspectRatioPreset => ({
  label: `${width}:${height}`,
  width,
  height,
  value: width / height,
})

// common presets offered in the settings picker
export const ASPECT_RATIO_PRESETS: readonly AspectRatioPreset[] = [
  preset(1, 1),
  preset(2, 3),
  preset(3, 4),
  preset(3, 2),
  preset(4, 3),
  preset(16, 9),
  preset(9, 16),
]

export interface RatioOption
{
  kind: 'auto' | 'preset' | 'custom'
  label: string
  value?: number
}

export const AUTO_RATIO_OPTION: RatioOption = { kind: 'auto', label: 'Auto' }
export const CUSTOM_RATIO_OPTION: RatioOption = {
  kind: 'custom',
  label: 'Custom',
}

export const PRESET_RATIO_OPTIONS: readonly RatioOption[] =
  ASPECT_RATIO_PRESETS.map(
    (p): RatioOption => ({ kind: 'preset', label: p.label, value: p.value })
  )

// shown as a tile grid above the custom input row (auto + all presets)
export const NON_CUSTOM_RATIO_OPTIONS: readonly RatioOption[] = [
  AUTO_RATIO_OPTION,
  ...PRESET_RATIO_OPTIONS,
]

// canonical ratio-picker options shared between the mixed-ratio modal & the
// settings section; 'auto' is first, preset chips in the middle, 'custom' last
export const RATIO_OPTIONS: readonly RatioOption[] = [
  ...NON_CUSTOM_RATIO_OPTIONS,
  CUSTOM_RATIO_OPTION,
]

// validate a W or H dimension string for the custom ratio input
export const isValidCustomDim = (value: string): boolean =>
{
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

// stringify a numeric ratio component as a trim decimal ("1.6", not "1.6000")
export const formatCustomRatioDim = (value: number, digits = 4): string =>
  value.toFixed(digits).replace(/\.?0+$/, '')

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

// read the effective board aspect ratio w/ the default applied when absent
export const getBoardItemAspectRatio = (
  board: Pick<BoardSnapshot, 'itemAspectRatio'>
): number =>
{
  const value = board.itemAspectRatio
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_ITEM_ASPECT_RATIO
}

export const getBoardAspectRatioMode = (
  board: Pick<BoardSnapshot, 'itemAspectRatioMode'>
): ItemAspectRatioMode => board.itemAspectRatioMode ?? 'auto'

// resolves the rendered image fit for an item: per-item override wins, then
// the board default (set via the bulk Cover all / Contain all), else 'cover'
export const getEffectiveImageFit = (
  item: Pick<TierItem, 'imageFit'>,
  boardDefault: ImageFit | undefined
): ImageFit => item.imageFit ?? boardDefault ?? 'cover'

export interface AspectRatioBucket
{
  representative: number
  count: number
}

const medianOf = (values: readonly number[]): number =>
{
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

// group ratios into buckets by tolerance; each bucket's representative is the
// median of its members. returned sorted by bucket size desc
export const bucketByAspectRatio = (
  ratios: readonly number[],
  tol = ASPECT_RATIO_TOLERANCE
): AspectRatioBucket[] =>
{
  const working: number[][] = []
  for (const ratio of ratios)
  {
    if (!Number.isFinite(ratio) || ratio <= 0) continue
    let placed = false
    for (const group of working)
    {
      if (ratiosMatch(ratio, group[0], tol))
      {
        group.push(ratio)
        placed = true
        break
      }
    }
    if (!placed) working.push([ratio])
  }

  return working
    .map((members) => ({
      representative: medianOf(members),
      count: members.length,
    }))
    .sort((a, b) => b.count - a.count)
}

// pick the ratio of the largest bucket, or null if no valid ratios were given
export const majorityAspectRatio = (
  ratios: readonly number[],
  tol = ASPECT_RATIO_TOLERANCE
): number | null =>
{
  const buckets = bucketByAspectRatio(ratios, tol)
  return buckets[0]?.representative ?? null
}

// gather aspect ratios of every image item whose natural dimensions have
// been captured — text items (no imageRef) are skipped
export const collectItemAspectRatios = (
  board: Pick<BoardSnapshot, 'items'>
): number[] =>
{
  const result: number[] = []
  for (const item of Object.values(board.items))
  {
    if (
      item.imageRef &&
      typeof item.aspectRatio === 'number' &&
      item.aspectRatio > 0
    )
    {
      result.push(item.aspectRatio)
    }
  }
  return result
}

// true when the item has a known ratio that doesn't match the board's; items
// w/o an imageRef or a captured ratio return false (never appear as issues)
export const itemHasAspectMismatch = (
  item: TierItem,
  boardRatio: number,
  tol = ASPECT_RATIO_TOLERANCE
): boolean =>
{
  if (
    !item.imageRef ||
    typeof item.aspectRatio !== 'number' ||
    item.aspectRatio <= 0
  )
  {
    return false
  }
  return !ratiosMatch(item.aspectRatio, boardRatio, tol)
}

// list every mismatched item on the board (any order)
export const findMismatchedItems = (
  board: Pick<BoardSnapshot, 'items' | 'itemAspectRatio'>,
  tol = ASPECT_RATIO_TOLERANCE
): TierItem[] =>
{
  const boardRatio = getBoardItemAspectRatio(board)
  const result: TierItem[] = []
  for (const item of Object.values(board.items))
  {
    if (itemHasAspectMismatch(item, boardRatio, tol))
    {
      result.push(item)
    }
  }
  return result
}

export interface MismatchGroup
{
  representative: number
  items: TierItem[]
}

// group mismatched items into buckets by aspect ratio (same tolerance as ratio
// bucketing). sorted by count desc so the biggest group shows first
export const groupMismatchedItems = (
  board: Pick<BoardSnapshot, 'items' | 'itemAspectRatio'>,
  tol = ASPECT_RATIO_TOLERANCE
): MismatchGroup[] =>
{
  const mismatched = findMismatchedItems(board, tol)
  const working: { ratios: number[]; items: TierItem[] }[] = []
  for (const item of mismatched)
  {
    const ratio = item.aspectRatio
    if (typeof ratio !== 'number' || ratio <= 0) continue
    let placed = false
    for (const group of working)
    {
      if (ratiosMatch(ratio, group.ratios[0], tol))
      {
        group.ratios.push(ratio)
        group.items.push(item)
        placed = true
        break
      }
    }
    if (!placed) working.push({ ratios: [ratio], items: [item] })
  }
  return working
    .map((group) => ({
      representative: medianOf(group.ratios),
      items: group.items,
    }))
    .sort((a, b) => b.items.length - a.items.length)
}

// true if any item has a ratio that doesn't match the board's; short-circuits
// on first mismatch for cheap polling (used by toast & settings visibility)
export const hasAspectRatioIssues = (
  board: Pick<BoardSnapshot, 'items' | 'itemAspectRatio'>
): boolean =>
{
  const boardRatio = getBoardItemAspectRatio(board)
  for (const item of Object.values(board.items))
  {
    if (itemHasAspectMismatch(item, boardRatio)) return true
  }
  return false
}

// resolve the effective aspect ratio for a board in auto mode based on its
// current items. returns null when no items have ratios — callers should then
// leave the existing value untouched
export const computeAutoBoardAspectRatio = (
  board: Pick<BoardSnapshot, 'items'>
): number | null => majorityAspectRatio(collectItemAspectRatios(board))

// find a preset whose value matches within tolerance, else undefined
export const findMatchingPreset = (
  value: number,
  tol = ASPECT_RATIO_TOLERANCE
): AspectRatioPreset | undefined =>
  ASPECT_RATIO_PRESETS.find((preset) => ratiosMatch(preset.value, value, tol))

// resolve clean W:H strings for the custom inputs; prefers a matching preset's
// integer pair over a decimal ratio so users see "3:4" rather than "0.75:1"
export const resolveCustomRatioSeed = (
  ratio: number
): { width: string; height: string } =>
{
  const match = findMatchingPreset(ratio)
  if (match)
  {
    return { width: String(match.width), height: String(match.height) }
  }
  return { width: formatCustomRatioDim(ratio), height: '1' }
}

// pick the RatioOption that matches the current board state — 'Auto' when in
// auto mode, a preset when the value matches, else 'Custom'
export const ratioOptionForBoard = (
  ratio: number,
  mode: ItemAspectRatioMode
): RatioOption =>
{
  if (mode === 'auto') return AUTO_RATIO_OPTION
  const match = findMatchingPreset(ratio)
  if (!match) return CUSTOM_RATIO_OPTION
  return (
    PRESET_RATIO_OPTIONS.find((opt) => opt.label === match.label) ??
    CUSTOM_RATIO_OPTION
  )
}

// format a ratio as "w:h" — prefers presets, falls back to small-denominator
// rational approximations, else a 2-decimal string
export const formatAspectRatio = (value: number): string =>
{
  if (!Number.isFinite(value) || value <= 0) return '1:1'
  const preset = findMatchingPreset(value)
  if (preset) return preset.label

  for (let denom = 2; denom <= 16; denom += 1)
  {
    const num = Math.round(value * denom)
    if (num <= 0) continue
    if (ratiosMatch(num / denom, value, ASPECT_RATIO_TOLERANCE / 2))
    {
      return `${num}:${denom}`
    }
  }
  return value.toFixed(2)
}
