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
