// src/features/workspace/settings/data/local/settingsStorage.ts
// settings persistence key & schema version

// localStorage key for global user settings
export const SETTINGS_STORAGE_KEY = 'tier-list-builder-settings'

// bumped only on genuinely breaking user-data changes. mismatched versions
// reset to defaults via Zustand's persist middleware
export const SETTINGS_STORAGE_VERSION = 1
