// scripts/marketplace-seed/constants.ts
// shared constants for marketplace template seeding

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  LABEL_FONT_SIZE_PX_DEFAULT,
  type BoardLabelSettings,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'

import type { FolderMeta } from './types'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = resolve(moduleDir, '../..')
export const EXAMPLES_DIR = join(REPO_ROOT, 'examples')

export const SEED_FOLDER_CONCURRENCY = 2
export const SEED_ITEM_IO_CONCURRENCY = 8
export const SEED_CHUNK_UPLOAD_CONCURRENCY = 2
export const SEED_ACTION_MAX_ATTEMPTS = 4
export const SEED_ACTION_RETRY_BASE_MS = 750
export const MIXED_TEMPLATE_ITEM_ASPECT_RATIO = 1
export const SEED_TILE_MAX_SIZE = 120
export const SEED_PREVIEW_MAX_SIZE = 1280
export const MAX_CHUNK_BASE64_BYTES = 2 * 1024 * 1024
export const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
])

export const DEFAULT_SEED_AUTHOR = {
  email: 'tterrag456@gmail.com',
  password: 'Hello123!',
  displayName: 'Terra',
} as const

export const SSBU_CLASSIC_PRESET: readonly TierPresetTier[] = [
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'B', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'C', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'D', colorSpec: { kind: 'palette', index: 7 } },
  { name: 'E', colorSpec: { kind: 'palette', index: 10 } },
]

export const LABEL_DEFAULT_STYLE: BoardLabelSettings = {
  show: true,
  placement: { mode: 'captionBelow' },
  fontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
}

export const DEFAULT_META: FolderMeta = {
  category: 'other',
  description: null,
  tags: [],
}

export const FEATURED_RANKS: Record<string, number> = {
  'ssbu-fighters': 0,
  'zelda-games': 1,
  'mcu-posters': 2,
}
