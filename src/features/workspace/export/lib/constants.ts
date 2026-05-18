// src/features/workspace/export/lib/constants.ts
// export-specific constants — image-format meta & render settings

import type { ImageFormat } from '~/features/workspace/export/model/runtime'

// device pixel ratio used by html-to-image renders (raster sharpness)
export const EXPORT_PIXEL_RATIO = 2

// quality setting for JPEG & WebP encoding (0-1)
export const IMAGE_QUALITY = 0.92

interface ImageFormatMeta
{
  label: string
  ext: string
  mimeType: string
}

export const IMAGE_FORMAT_META: Record<ImageFormat, ImageFormatMeta> = {
  png: { label: 'PNG', ext: 'png', mimeType: 'image/png' },
  jpeg: { label: 'JPEG', ext: 'jpeg', mimeType: 'image/jpeg' },
  webp: { label: 'WebP', ext: 'webp', mimeType: 'image/webp' },
  svg: { label: 'SVG', ext: 'svg', mimeType: 'image/svg+xml' },
}

// stable render order used by every UI format picker
export const IMAGE_FORMATS: readonly ImageFormat[] = [
  'png',
  'jpeg',
  'webp',
  'svg',
]
