// src/shared/board-ui/constants.ts
// shared board-rendering constants used by live, export, & embed views

import type { ItemShape, ItemSize, LabelWidth } from '@/shared/types/settings'

// item size presets in pixels
export const ITEM_SIZE_PX: Record<ItemSize, number> = {
  small: 64,
  medium: 104,
  large: 140,
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
