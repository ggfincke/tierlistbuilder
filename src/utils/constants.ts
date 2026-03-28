// src/utils/constants.ts
// app-wide constants — storage keys, defaults, & tier presets

import type { ItemShape, ItemSize, LabelWidth, PaletteId, Tier } from '../types'
import { PALETTES, THEMES } from '../theme'

// default board title used on first load & for newly created boards
export const DEFAULT_TITLE = 'My Tier List'
// droppable container ID for the unranked pool
export const UNRANKED_CONTAINER_ID = 'unranked'
// droppable ID for the drag-to-trash zone
export const TRASH_CONTAINER_ID = 'trash'
// max pixel dimension for resized thumbnail images
export const MAX_THUMBNAIL_SIZE = 120

// stable tier IDs for the default S–E rows (indexed by position)
const DEFAULT_TIER_IDS = [
  'tier-s',
  'tier-a',
  'tier-b',
  'tier-c',
  'tier-d',
  'tier-e',
]

// display names for the default S–E rows (separated from palette color data)
const DEFAULT_TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E']

// background color applied during PNG & PDF export (mirrors classic theme)
export const EXPORT_BACKGROUND_COLOR = THEMES.classic['export-bg']

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

// convert a board title to a URL-safe filename base
export const toFileBase = (title: string): string =>
{
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'tier-list'
}

// clamp index to [min, max] inclusive
export const clampIndex = (index: number, min: number, max: number): number =>
{
  return Math.max(min, Math.min(max, index))
}

// build a fresh set of default tiers w/ empty item lists
export const buildDefaultTiers = (paletteId: PaletteId = 'classic'): Tier[] =>
{
  const palette = PALETTES[paletteId]
  return palette.defaults.map((color, i) => ({
    id:
      DEFAULT_TIER_IDS[i] ??
      `tier-${(DEFAULT_TIER_NAMES[i] ?? `${i + 1}`).toLowerCase()}`,
    name: DEFAULT_TIER_NAMES[i] ?? `Tier ${i + 1}`,
    color,
    colorSource: { paletteType: 'default' as const, index: i },
    itemIds: [],
  }))
}
