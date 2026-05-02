// src/features/workspace/imageEditor/lib/labelEditorOptions.ts
// caption-editor option labels shared across image-editor UI modules

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'

export const LABEL_FONT_LABELS: Record<TextStyleId, string> = {
  default: 'Sans',
  mono: 'Mono',
  serif: 'Serif',
  rounded: 'Rounded',
  display: 'Display',
}
