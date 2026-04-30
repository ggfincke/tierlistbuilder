// src/features/workspace/export/model/runtime.ts
// export format types & render-time appearance snapshots — runtime-only, not
// persisted or sent across process boundaries so they live here vs. contracts

import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/workspace/settings'
import type {
  PaletteId,
  TextStyleId,
} from '@tierlistbuilder/contracts/lib/theme'

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
  textStyleId: TextStyleId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
}
