// packages/contracts/platform/media.ts
// media contract - shared variant names, size limits, & supported MIME types

export const MEDIA_VARIANT_KINDS = ['tile', 'preview', 'editor'] as const

export type MediaVariantKind = (typeof MEDIA_VARIANT_KINDS)[number]

export const MAX_MEDIA_VARIANTS_PER_ASSET = MEDIA_VARIANT_KINDS.length

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]

// hard cap on image byte size — 20MB
export const MAX_IMAGE_BYTE_SIZE = 20 * 1024 * 1024

// sanity bound on image dimensions — rejects obviously malformed data
export const MAX_IMAGE_DIMENSION = 10_000
