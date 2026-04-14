// src/features/workspace/settings/data/local/settingsStorage.ts
// settings persistence key & schema version

// localStorage key for global user settings
export const SETTINGS_STORAGE_KEY = 'tier-list-builder-settings'

// bumped only on genuinely breaking user-data changes; legacy migration chains
// are removed as part of structural cleanups — see CLAUDE.md
export const SETTINGS_STORAGE_VERSION = 1
