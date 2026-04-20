// packages/contracts/platform/media.ts
// media upload contract — shared limits & MIME set between frontend uploader & Convex validators

export type SupportedImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'

export const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

// hard cap on image byte size — 20MB
export const MAX_IMAGE_BYTE_SIZE = 20 * 1024 * 1024

// sanity bound on image dimensions — rejects obviously malformed data
export const MAX_IMAGE_DIMENSION = 10_000

// sha256 hex digest is always 64 lowercase hex chars
export const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/
