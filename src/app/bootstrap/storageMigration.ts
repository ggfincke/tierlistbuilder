// src/app/bootstrap/storageMigration.ts
// bootstrap-time localStorage key migration before stores hydrate

import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '@/shared/lib/browserStorage'
import { APP_STORAGE_KEY } from '@/features/workspace/boards/data/local/boardMigration'
import { BOARD_REGISTRY_KEY } from '@/features/workspace/boards/data/local/boardRegistryStorage'
import { SETTINGS_STORAGE_KEY } from '@/features/workspace/settings/data/local/settingsStorage'

const LEGACY_APP_STORAGE_KEY = 'tier-list-maker-state'
const LEGACY_BOARD_REGISTRY_KEY = 'tier-list-maker-boards'
const LEGACY_SETTINGS_KEY = 'tier-list-maker-settings'

// migrate legacy "maker" localStorage keys to "builder" equivalents
export const migrateStorageKeys = (): void =>
{
  for (const [oldKey, newKey] of [
    [LEGACY_APP_STORAGE_KEY, APP_STORAGE_KEY],
    [LEGACY_BOARD_REGISTRY_KEY, BOARD_REGISTRY_KEY],
    [LEGACY_SETTINGS_KEY, SETTINGS_STORAGE_KEY],
  ] as const)
  {
    const oldValue = readBrowserStorageItem(oldKey)
    if (oldValue && !readBrowserStorageItem(newKey))
    {
      writeBrowserStorageItem(newKey, oldValue)
      deleteBrowserStorageItem(oldKey)
    }
  }
}
