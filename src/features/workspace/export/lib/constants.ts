// src/features/workspace/export/lib/constants.ts
// export-specific constants & file-name helpers

import { toFileBase } from '@/shared/lib/fileName'
import { THEMES } from '@/shared/theme'

// background color applied during PNG & PDF export (mirrors classic theme)
export const EXPORT_BACKGROUND_COLOR = THEMES.classic['export-bg']

export { toFileBase }
