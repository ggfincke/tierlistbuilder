// src/shared/board-ui/constants.ts
// shared board-rendering constants used by live, export, & embed views

import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@/shared/types/settings'

// how an image fills its slot when aspect ratios differ
export type ImageFit = 'cover' | 'contain'

// item long-edge size in pixels — the longer side of the slot is always
// pinned here, & the shorter side is derived from the board's aspect ratio
export const ITEM_LONG_EDGE_PX: Record<ItemSize, number> = {
  small: 64,
  medium: 104,
  large: 140,
}

export interface ItemSlotDimensions
{
  width: number
  height: number
}

// derive the slot dimensions for a given item size & aspect ratio (w/h). the
// longer side stays pinned to ITEM_LONG_EDGE_PX so "large" items are always
// ~140px on their longest side regardless of orientation
export const itemSlotDimensions = (
  itemSize: ItemSize,
  aspectRatio = 1
): ItemSlotDimensions =>
{
  const longEdge = ITEM_LONG_EDGE_PX[itemSize]
  const ratio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  if (ratio >= 1)
  {
    return { width: longEdge, height: Math.round(longEdge / ratio) }
  }
  return { width: Math.round(longEdge * ratio), height: longEdge }
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
}
