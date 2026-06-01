// src/shared/board-ui/labels/labelBandVariant.ts
// resolves caption-band geometry for label-aware auto-crop.

import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'

import { resolveItemLabel } from '~/shared/board-ui/labels/labelDisplay'

// font family can change caption line-height; keep it in the variant key
export interface LabelBandVariant
{
  placement: 'captionAbove' | 'captionBelow'
  fontSizePx: number
  textStyleId: TextStyleId | undefined
}

export const labelBandVariantKey = (variant: LabelBandVariant): string =>
  `${variant.placement}:${variant.fontSizePx}:${variant.textStyleId ?? ''}`

interface VariantInput
{
  item: Pick<TierItem, 'label' | 'labelOptions'>
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
}

// null means no live caption band: empty text, hidden label, or overlay mode
export const getItemLabelBandVariant = ({
  item,
  boardLabels,
  globalLabelDefaults,
}: VariantInput): LabelBandVariant | null =>
{
  const display = resolveItemLabel(item, boardLabels, globalLabelDefaults)
  if (!display) return null
  if (
    display.placement.mode !== 'captionAbove' &&
    display.placement.mode !== 'captionBelow'
  )
  {
    return null
  }
  return {
    placement: display.placement.mode,
    fontSizePx: display.fontSizePx,
    textStyleId: display.textStyleId,
  }
}
