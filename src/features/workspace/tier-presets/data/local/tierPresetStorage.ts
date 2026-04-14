// src/features/workspace/tier-presets/data/local/tierPresetStorage.ts
// tier-preset persistence key & schema version

export const PRESET_STORAGE_KEY = 'tier-list-builder-presets'

// bumped only on genuinely breaking user-data changes; legacy normalization
// chains are removed as part of structural cleanups — see CLAUDE.md
export const PRESET_STORAGE_VERSION = 1
