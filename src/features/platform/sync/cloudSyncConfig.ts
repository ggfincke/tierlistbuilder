// src/features/platform/sync/cloudSyncConfig.ts
// shared cloud-sync enablement flag for runtime gating in hooks & UI

export const CLOUD_SYNC_ENABLED =
  import.meta.env.VITE_ENABLE_CLOUD_SYNC !== 'false'
