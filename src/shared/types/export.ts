// src/shared/types/export.ts
// export format types & render-time appearance snapshots

import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/workspace/settings'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'

// supported image export formats
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'svg'

// appearance settings needed to render a board for export capture
export interface ExportAppearance
{
  itemSize: ItemSize
  showLabels: boolean
  itemShape: ItemShape
  compactMode: boolean
  labelWidth: LabelWidth
  paletteId: PaletteId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
}
