// src/features/platform/sync/lib/concurrency.ts
// per-op concurrency & timing tunables for cloud-sync related workloads

export const SYNC_CONCURRENCY = {
  // parallel board merges during first-login reconciliation
  firstLoginBoard: 3,
  // parallel board pulls from the cloud
  pull: 3,
  // page size when paginating pulled board lists
  pullBatch: 3,
  // parallel board deletes
  delete: 4,
  // parallel media uploads
  upload: 3,
  // parallel preset merges during first-login reconciliation
  presetMerge: 3,
  // parallel board imports (inbound share resolution)
  boardImport: 3,
  // parallel blob fetches when hydrating cloud images
  blobFetch: 8,
} as const

// debounce window shared across settings/presets/board sync schedulers
export const CLOUD_SYNC_DEBOUNCE_MS = 2500
