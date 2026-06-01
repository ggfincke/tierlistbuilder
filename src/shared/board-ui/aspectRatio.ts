// src/shared/board-ui/aspectRatio.ts
// aspect-ratio bucketing, matching, & board-level mismatch detection

import type {
  BoardSnapshot,
  ImageFit,
  ItemAspectRatioMode,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  clampImagePadding,
  DEFAULT_ITEM_IMAGE_PADDING,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ASPECT_RATIO_PRESETS,
  ASPECT_RATIO_TOLERANCE,
  bucketValuesByAspectRatio,
  findMatchingPreset,
  majorityAspectRatio,
  normalizeBoardItemAspectRatio,
  ratiosMatch,
  type AspectRatioPreset,
} from '@tierlistbuilder/contracts/workspace/aspectRatio'

import { hasAnyImageRef } from '~/shared/lib/imageRefs'
import { isPositiveFiniteNumber } from '~/shared/lib/typeGuards'

const DEFAULT_ITEM_ASPECT_RATIO = 1

export interface RatioOption
{
  kind: 'auto' | 'preset' | 'custom'
  label: string
  value?: number
}

const AUTO_RATIO_OPTION: RatioOption = { kind: 'auto', label: 'Auto' }
export const CUSTOM_RATIO_OPTION: RatioOption = {
  kind: 'custom',
  label: 'Custom',
}

const PRESET_RATIO_OPTIONS: readonly RatioOption[] = ASPECT_RATIO_PRESETS.map(
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

export const parseCustomAspectRatio = (
  width: string,
  height: string
): number | null =>
{
  const w = Number(width)
  const h = Number(height)
  if (!isPositiveFiniteNumber(w) || !isPositiveFiniteNumber(h)) return null
  return normalizeBoardItemAspectRatio(w / h) ?? null
}

export const formatCustomRatioDim = (value: number, digits = 4): string =>
  value.toFixed(digits).replace(/\.?0+$/, '')

export const getBoardItemAspectRatio = (
  board: Pick<BoardSnapshot, 'itemAspectRatio'>
): number =>
{
  const value = board.itemAspectRatio
  return normalizeBoardItemAspectRatio(value) ?? DEFAULT_ITEM_ASPECT_RATIO
}

export const getBoardAspectRatioMode = (
  board: Pick<BoardSnapshot, 'itemAspectRatioMode'>
): ItemAspectRatioMode => board.itemAspectRatioMode ?? 'auto'

export const getEffectiveImageFit = (
  item: Pick<TierItem, 'imageFit'>,
  boardDefault: ImageFit | undefined
): ImageFit => item.imageFit ?? boardDefault ?? 'cover'

// resolve the rendered plate inset for an item. item override wins, then the
// board default; w/ neither set a plated item gets DEFAULT_ITEM_IMAGE_PADDING
// while an unplated item stays full-bleed (0). hasPlate = a backdrop is applied
export const getEffectiveImagePadding = (
  item: Pick<TierItem, 'imagePadding'>,
  boardDefault: number | undefined,
  hasPlate: boolean
): number =>
{
  const explicit = item.imagePadding ?? boardDefault
  if (explicit != null) return clampImagePadding(explicit)
  return hasPlate ? DEFAULT_ITEM_IMAGE_PADDING : 0
}

// padding insets each edge, so the image frame spans (1 - 2*padding) of the
// cell on each axis. floored at 0 so an over-large padding can't invert the
// scale. shared by the inset-frame render & the editor's gesture normalization
export const getPaddingFrameScale = (padding: number): number =>
  Math.max(0, 1 - 2 * padding)

// gather aspect ratios of every image item whose natural dimensions have
// been captured; text items are skipped
const collectItemAspectRatios = (
  board: Pick<BoardSnapshot, 'items'>
): number[] =>
{
  const result: number[] = []
  for (const item of Object.values(board.items))
  {
    if (hasAnyImageRef(item) && isPositiveFiniteNumber(item.aspectRatio))
    {
      result.push(item.aspectRatio)
    }
  }
  return result
}

// true when a known image ratio doesn't match the board's; items w/o image
// bytes or a captured ratio return false so they never appear as issues
export const itemHasAspectMismatch = (
  item: TierItem,
  boardRatio: number,
  tol = ASPECT_RATIO_TOLERANCE
): boolean =>
{
  if (!hasAnyImageRef(item) || !isPositiveFiniteNumber(item.aspectRatio))
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

// resolve the effective aspect ratio for a board in auto mode based on its
// current items. returns null when no items have ratios — callers should then
// leave the existing value untouched
export const computeAutoBoardAspectRatio = (
  board: Pick<BoardSnapshot, 'items'>
): number | null =>
{
  const ratio = majorityAspectRatio(collectItemAspectRatios(board))
  return normalizeBoardItemAspectRatio(ratio) ?? null
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

interface RatioFraction
{
  numerator: number
  denominator: number
}

interface ApproximateRatioFractionOptions
{
  minDenom: number
  maxDenom: number
  tolerance: number
}

const approximateRatioFraction = (
  value: number,
  { minDenom, maxDenom, tolerance }: ApproximateRatioFractionOptions
): RatioFraction | null =>
{
  for (let denom = minDenom; denom <= maxDenom; denom += 1)
  {
    const num = Math.round(value * denom)
    if (num <= 0) continue
    if (ratiosMatch(num / denom, value, tolerance))
    {
      return { numerator: num, denominator: denom }
    }
  }

  return null
}

const formatRatioFraction = ({
  numerator,
  denominator,
}: RatioFraction): string => `${numerator}:${denominator}`

// format a ratio as "w:h" — prefers presets, falls back to small-denominator
// rational approximations, else a 2-decimal string
export const formatAspectRatio = (value: number): string =>
{
  if (!isPositiveFiniteNumber(value)) return '1:1'
  const preset = findMatchingPreset(value)
  if (preset) return preset.label

  const fraction = approximateRatioFraction(value, {
    minDenom: 2,
    maxDenom: 16,
    tolerance: ASPECT_RATIO_TOLERANCE / 2,
  })
  if (fraction) return formatRatioFraction(fraction)

  return value.toFixed(2)
}

export const formatPreciseAspectRatio = (value: number): string =>
{
  if (!isPositiveFiniteNumber(value)) return '1:1'

  const fraction = approximateRatioFraction(value, {
    minDenom: 1,
    maxDenom: 16,
    tolerance: 0.001,
  })
  if (fraction) return formatRatioFraction(fraction)

  return `${formatCustomRatioDim(value, 2)}:1`
}
