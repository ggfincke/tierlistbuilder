// src/shared/board-ui/constants.ts
// shared board-rendering constants used by live, export, & embed views

import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/workspace/settings'

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
