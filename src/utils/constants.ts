// src/utils/constants.ts
// app-wide constants — storage keys, defaults, & tier presets

import type { ItemShape, ItemSize, LabelWidth, Tier } from '../types'

// legacy localStorage key — used only for migration detection
export const APP_STORAGE_KEY = 'tier-list-maker-state'
// localStorage key for the multi-board registry
export const BOARD_REGISTRY_KEY = 'tier-list-maker-boards'
// build a per-board localStorage key from its ID
export const boardStorageKey = (id: string): string => `tier-list-board-${id}`
// default board title used on first load & after reset
export const DEFAULT_TITLE = 'My Tier List'
// droppable container ID for the unranked pool
export const UNRANKED_CONTAINER_ID = 'unranked'
// droppable ID for the drag-to-trash zone
export const TRASH_CONTAINER_ID = 'trash'
// max pixel dimension for resized thumbnail images
export const MAX_THUMBNAIL_SIZE = 120

// template for the default S–E tier rows (no items)
const DEFAULT_TIER_TEMPLATE: Array<Omit<Tier, 'itemIds'>> = [
  { id: 'tier-s', name: 'S', color: '#f47c7c' },
  { id: 'tier-a', name: 'A', color: '#f1b878' },
  { id: 'tier-b', name: 'B', color: '#edd77b' },
  { id: 'tier-c', name: 'C', color: '#e3ea78' },
  { id: 'tier-d', name: 'D', color: '#abe36d' },
  { id: 'tier-e', name: 'E', color: '#74e56d' },
]

// ordered preset colors shown in the color picker
export const PRESET_TIER_COLORS = [
  '#f47c7c',
  '#f4a460',
  '#f0d58c',
  '#fdfd96',
  '#d4f77f',
  '#77dd77',
  '#a0f0e8',
  '#89cff0',
  '#7b68ee',
  '#f59ede',
  '#b39eb5',
  '#2d2d2d',
  '#888888',
  '#cccccc',
  '#eeeeee',
]

// background color applied during PNG & PDF export
export const EXPORT_BACKGROUND_COLOR = '#232323'

// localStorage key for global user settings
export const SETTINGS_STORAGE_KEY = 'tier-list-maker-settings'

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

// estimate total localStorage usage in bytes (UTF-16 = 2 bytes per char)
export const getStorageUsageBytes = (): number =>
{
  let chars = 0
  for (let i = 0; i < localStorage.length; i++)
  {
    const key = localStorage.key(i)!
    chars += key.length + (localStorage.getItem(key)?.length ?? 0)
  }
  return chars * 2
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
export const buildDefaultTiers = (): Tier[] =>
  DEFAULT_TIER_TEMPLATE.map((tier) => ({ ...tier, itemIds: [] }))
