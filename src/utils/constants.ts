// src/utils/constants.ts
// app-wide constants — storage keys, defaults, & tier presets
import type { Tier } from '../types'

// localStorage key for persisted board state
export const APP_STORAGE_KEY = 'tier-list-maker-state'
// default board title used on first load & after reset
export const DEFAULT_TITLE = 'My Tier List'
// droppable container ID for the unranked pool
export const UNRANKED_CONTAINER_ID = 'unranked'
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

// convert a board title to a URL-safe filename base
export const toFileBase = (title: string): string => {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'tier-list'
}

// clamp index to [min, max] inclusive
export const clampIndex = (index: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, index))
}

// build a fresh set of default tiers w/ empty item lists
export const buildDefaultTiers = (): Tier[] =>
  DEFAULT_TIER_TEMPLATE.map((tier) => ({ ...tier, itemIds: [] }))
