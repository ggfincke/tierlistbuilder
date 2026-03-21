// src/utils/constants.ts
// app-wide constants — storage keys, defaults, & tier presets

import type { ItemShape, ItemSize, LabelWidth, PaletteId, Tier } from '../types'
import { PALETTES, THEMES } from '../theme'

// legacy localStorage keys — used only for migration detection
export const APP_STORAGE_KEY = 'tier-list-builder-state'
const LEGACY_APP_STORAGE_KEY = 'tier-list-maker-state'
const LEGACY_BOARD_REGISTRY_KEY = 'tier-list-maker-boards'
const LEGACY_SETTINGS_KEY = 'tier-list-maker-settings'
// localStorage key for the multi-board registry
export const BOARD_REGISTRY_KEY = 'tier-list-builder-boards'
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

// stable tier IDs for the default S–E rows (indexed by position)
const DEFAULT_TIER_IDS = [
  'tier-s',
  'tier-a',
  'tier-b',
  'tier-c',
  'tier-d',
  'tier-e',
]

// background color applied during PNG & PDF export (mirrors classic theme)
export const EXPORT_BACKGROUND_COLOR = THEMES.classic['export-bg']

// localStorage key for global user settings
export const SETTINGS_STORAGE_KEY = 'tier-list-builder-settings'

// migrate legacy "maker" localStorage keys to "builder" equivalents
export const migrateStorageKeys = (): void =>
{
  for (const [oldKey, newKey] of [
    [LEGACY_APP_STORAGE_KEY, APP_STORAGE_KEY],
    [LEGACY_BOARD_REGISTRY_KEY, BOARD_REGISTRY_KEY],
    [LEGACY_SETTINGS_KEY, SETTINGS_STORAGE_KEY],
  ] as const)
  {
    if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey))
    {
      localStorage.setItem(newKey, localStorage.getItem(oldKey)!)
      localStorage.removeItem(oldKey)
    }
  }
}

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
export const buildDefaultTiers = (paletteId: PaletteId = 'classic'): Tier[] =>
{
  const palette = PALETTES[paletteId]
  return palette.defaults.map((entry, i) => ({
    id: DEFAULT_TIER_IDS[i] ?? `tier-${entry.name.toLowerCase()}`,
    name: entry.name,
    color: entry.color,
    colorSource: {
      paletteType: 'default' as const,
      index: i,
    },
    itemIds: [],
  }))
}
