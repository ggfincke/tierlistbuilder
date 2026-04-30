// src/shared/board-ui/aspectRatio.ts
// aspect-ratio bucketing, matching, & board-level mismatch detection

import type {
  BoardSnapshot,
  ImageFit,
  ItemAspectRatioMode,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ASPECT_RATIO_PRESETS,
  ASPECT_RATIO_TOLERANCE,
  bucketValuesByAspectRatio,
  findMatchingPreset,
  majorityAspectRatio,
  ratiosMatch,
  type AspectRatioPreset,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import { isPositiveFiniteNumber } from '~/shared/lib/typeGuards'

export { snapToNearestPreset } from '@tierlistbuilder/contracts/workspace/imageMath'
export type { AspectRatioPreset } from '@tierlistbuilder/contracts/workspace/imageMath'

export const DEFAULT_ITEM_ASPECT_RATIO = 1

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
    (p: AspectRatioPreset): RatioOption => ({
      kind: 'preset',
      label: p.label,
      value: p.value,
    })
  )

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

export const isValidCustomDim = (value: string): boolean =>
{
  const n = Number(value)
  return isPositiveFiniteNumber(n)
}

export const formatCustomRatioDim = (value: number, digits = 4): string =>
  value.toFixed(digits).replace(/\.?0+$/, '')

export const getBoardItemAspectRatio = (
  board: Pick<BoardSnapshot, 'itemAspectRatio'>
): number =>
{
  const value = board.itemAspectRatio
  return isPositiveFiniteNumber(value) ? value : DEFAULT_ITEM_ASPECT_RATIO
}

export const getBoardAspectRatioMode = (
  board: Pick<BoardSnapshot, 'itemAspectRatioMode'>
): ItemAspectRatioMode => board.itemAspectRatioMode ?? 'auto'

export const getEffectiveImageFit = (
  item: Pick<TierItem, 'imageFit'>,
  boardDefault: ImageFit | undefined
): ImageFit => item.imageFit ?? boardDefault ?? 'cover'

// gather aspect ratios of every image item whose natural dimensions have
// been captured — text items (no imageRef) are skipped
export const collectItemAspectRatios = (
  board: Pick<BoardSnapshot, 'items'>
): number[] =>
{
  const result: number[] = []
  for (const item of Object.values(board.items))
  {
    if (item.imageRef && isPositiveFiniteNumber(item.aspectRatio))
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
  if (!item.imageRef || !isPositiveFiniteNumber(item.aspectRatio))
  {
    return false
  }
  return !ratiosMatch(item.aspectRatio, boardRatio, tol)
}

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
  return bucketValuesByAspectRatio(
    mismatched,
    (item) => item.aspectRatio,
    tol
  ).map((group) => ({
    representative: group.representative,
    items: group.values,
  }))
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
): number | null =>
{
  return majorityAspectRatio(collectItemAspectRatios(board))
}

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
  if (!isPositiveFiniteNumber(value)) return '1:1'
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

export const formatPreciseAspectRatio = (value: number): string =>
{
  if (!isPositiveFiniteNumber(value)) return '1:1'

  for (let denom = 1; denom <= 16; denom += 1)
  {
    const num = Math.round(value * denom)
    if (num <= 0) continue
    if (ratiosMatch(num / denom, value, 0.001))
    {
      return `${num}:${denom}`
    }
  }

  return `${formatCustomRatioDim(value, 2)}:1`
}
