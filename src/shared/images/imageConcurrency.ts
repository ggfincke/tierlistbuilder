// src/shared/images/imageConcurrency.ts
// concurrency limits shared across the image persistence pipeline

// bound parallel blob prepare work (hash + record build). limit is low
// because hashing is CPU-heavy & we don't want to starve the main thread
export const BLOB_PREPARE_CONCURRENCY = 3
