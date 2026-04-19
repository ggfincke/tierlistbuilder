// src/features/workspace/export/lib/constants.ts
// export-specific constants — file-name helpers, format labels, & render settings

import type { ImageFormat } from '../model/runtime'
import { THEMES } from '~/shared/theme/tokens'

// background color applied during PNG & PDF export (mirrors classic theme)
export const EXPORT_BACKGROUND_COLOR = THEMES.classic['export-bg']

// device pixel ratio used by html-to-image renders (raster sharpness)
export const EXPORT_PIXEL_RATIO = 2

export const IMAGE_FORMATS: readonly ImageFormat[] = [
  'png',
  'jpeg',
  'webp',
  'svg',
]

export const FORMAT_LABELS: Record<ImageFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  svg: 'SVG',
}
