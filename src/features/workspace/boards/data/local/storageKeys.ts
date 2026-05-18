// src/features/workspace/boards/data/local/storageKeys.ts
// localStorage key shapes for the multi-board registry & per-board envelopes.
// kept dep-free so e2e specs can import via relative path

export const BOARD_REGISTRY_STORAGE_KEY = 'tier-list-builder-boards'

export const boardStorageKey = (id: string): string => `tier-list-board-${id}`

export const boardSyncStorageKey = (id: string): string =>
  `tier-list-board-sync-${id}`
