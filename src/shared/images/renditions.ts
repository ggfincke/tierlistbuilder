// src/shared/images/renditions.ts
// rendition contract: pixel sizes & encoding parameters for the three
// tier-item image variants persisted in IndexedDB

// preview thumb (smallest, cheap warm-up); board-rendered tile is below
export const MAX_THUMBNAIL_SIZE = 120

// max pixel dimension for board-rendered tile images
export const MAX_BOARD_TILE_IMAGE_SIZE = 768

// board tile encoding balances poster detail against payload size
export const BOARD_TILE_IMAGE_MIME_TYPE = 'image/webp'
export const BOARD_TILE_IMAGE_QUALITY = 0.86

// max pixel dimension for local editor source images
export const MAX_EDITOR_SOURCE_SIZE = 1024
