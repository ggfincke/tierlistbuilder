// src/shared/board-ui/constants.ts
// shared board-rendering constants used by live, export, & embed views

import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/platform/preferences'
import type { ImageFit } from '@tierlistbuilder/contracts/workspace/board'
import { normalizeBoardItemAspectRatio } from '@tierlistbuilder/contracts/workspace/aspectRatio'

// reference edge for a 1:1 slot — also the geometric mean for non-square
// ratios, so all aspect ratios occupy the same visual area as the square
export const ITEM_LONG_EDGE_PX: Record<ItemSize, number> = {
  small: 64,
  medium: 104,
  large: 140,
  xl: 180,
}

interface ItemSlotDimensions
{
  width: number
  height: number
}

// derive the slot dimensions for a given item size & aspect ratio (w/h).
// pin by area (square edge²) so 1:1 stays its reference size & non-square
// ratios scale to the same visual mass — width = edge·√r, height = edge/√r
export const itemSlotDimensions = (
  itemSize: ItemSize,
  aspectRatio = 1
): ItemSlotDimensions =>
{
  const edge = ITEM_LONG_EDGE_PX[itemSize]
  const ratio = normalizeBoardItemAspectRatio(aspectRatio) ?? 1
  const sqrtRatio = Math.sqrt(ratio)
  return {
    width: Math.round(edge * sqrtRatio),
    height: Math.round(edge / sqrtRatio),
  }
}

// tier label column width presets in pixels
export const LABEL_WIDTH_PX: Record<LabelWidth, number> = {
  narrow: 80,
  default: 118,
  wide: 160,
}

// item shape CSS class map — static so Tailwind can statically analyze these
export const SHAPE_CLASS: Record<ItemShape, string> = {
  square: '',
  rounded: 'rounded-lg',
  circle: 'rounded-full',
}

// object-fit CSS class map — paired w/ SHAPE_CLASS for img rendering
export const OBJECT_FIT_CLASS: Record<ImageFit, string> = {
  cover: 'object-cover',
  contain: 'object-contain',
}

// tier label font size token map
export const LABEL_FONT_SIZE_CLASS: Record<TierLabelFontSize, string> = {
  xs: 'text-xs',
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
  xl: 'text-xl',
}

// tier label padding map keyed off item size — keeps text tightly centered
export const LABEL_PADDING_CLASS: Record<ItemSize, string> = {
  small: 'px-1.5 py-1',
  medium: 'px-3 py-2',
  large: 'px-4 py-3',
  xl: 'px-5 py-4',
}
