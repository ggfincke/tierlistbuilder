// src/features/workspace/tier-presets/data/local/tierPresetStorage.ts
// tier-preset persistence key & schema version

export const PRESET_STORAGE_KEY = 'tier-list-builder-presets'

// bumped only on genuinely breaking user-data changes. mismatched versions
// reset to defaults via Zustand's persist middleware
export const PRESET_STORAGE_VERSION = 1
