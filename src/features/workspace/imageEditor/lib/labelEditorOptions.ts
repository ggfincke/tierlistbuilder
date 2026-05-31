// src/features/workspace/imageEditor/lib/labelEditorOptions.ts
// caption-editor option labels shared across image-editor UI modules

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type { LabelPlacementMode } from '@tierlistbuilder/contracts/workspace/board'

export const LABEL_FONT_LABELS: Record<TextStyleId, string> = {
  default: 'Sans',
  mono: 'Mono',
  serif: 'Serif',
  rounded: 'Rounded',
  display: 'Display',
}

export const PLACEMENT_MODE_LABELS_FULL: Record<LabelPlacementMode, string> = {
  overlay: 'Overlay',
  captionAbove: 'Caption above',
  captionBelow: 'Caption below',
}

export const PLACEMENT_MODE_LABELS_SHORT: Record<LabelPlacementMode, string> = {
  overlay: 'Overlay',
  captionAbove: 'Above',
  captionBelow: 'Below',
}
