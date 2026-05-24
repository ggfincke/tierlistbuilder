// packages/contracts/workspace/boardEnvelope.ts
// schema version for persisted & JSON-exported board payloads; pre-1.0 wipes

export const BOARD_DATA_VERSION = 1

// local JSON import caps. Export payloads may include inline image data, so the
// file cap is intentionally much larger than share-link payload limits while
// still preventing unbounded browser reads/parses from user-selected files
export const MAX_BOARD_IMPORT_JSON_BYTES = 64 * 1024 * 1024
export const MAX_BOARD_IMPORT_BOARDS = 200
