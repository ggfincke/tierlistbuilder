// src/shared/board-ui/labelDisplay.ts
// resolves per-tile label rendering settings against board & global defaults

import type {
  BoardLabelSettings,
  ItemLabelOptions,
  LabelPlacement,
  LabelScrim,
  LabelSizeScale,
} from '@tierlistbuilder/contracts/workspace/board'
import { LABEL_PLACEMENT_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'

export interface ResolvedLabelDisplay
{
  placement: LabelPlacement
  scrim: LabelScrim
  sizeScale: LabelSizeScale
  // optional caption font override; undefined -> inherit board/page font
  textStyleId: TextStyleId | undefined
  text: string
}

const DEFAULT_SCRIM: LabelScrim = 'dark'
const DEFAULT_SIZE_SCALE: LabelSizeScale = 'md'

interface ResolveInput
{
  itemLabel: string | undefined
  itemOptions: ItemLabelOptions | undefined
  boardSettings: BoardLabelSettings | undefined
  globalShowLabels: boolean
}

// returns null when the label should not render — either text is empty or
// every override layer resolves to invisible
export const resolveLabelDisplay = (
  input: ResolveInput
): ResolvedLabelDisplay | null =>
{
  const text = input.itemLabel?.trim() ?? ''
  if (text.length === 0) return null

  const visible =
    input.itemOptions?.visible ??
    input.boardSettings?.show ??
    input.globalShowLabels
  if (!visible) return null

  return {
    placement:
      input.itemOptions?.placement ??
      input.boardSettings?.placement ??
      LABEL_PLACEMENT_DEFAULT,
    scrim:
      input.itemOptions?.scrim ?? input.boardSettings?.scrim ?? DEFAULT_SCRIM,
    sizeScale:
      input.itemOptions?.sizeScale ??
      input.boardSettings?.sizeScale ??
      DEFAULT_SIZE_SCALE,
    textStyleId:
      input.itemOptions?.textStyleId ?? input.boardSettings?.textStyleId,
    text,
  }
}

// resolved settings ignoring the item text — used by Edit Images preview &
// the per-tile defaults reflected in modal controls
export const resolveLabelLayout = (
  input: Omit<ResolveInput, 'itemLabel'>
): { visible: boolean } & Omit<ResolvedLabelDisplay, 'text'> => ({
  visible:
    input.itemOptions?.visible ??
    input.boardSettings?.show ??
    input.globalShowLabels,
  placement:
    input.itemOptions?.placement ??
    input.boardSettings?.placement ??
    LABEL_PLACEMENT_DEFAULT,
  scrim:
    input.itemOptions?.scrim ?? input.boardSettings?.scrim ?? DEFAULT_SCRIM,
  sizeScale:
    input.itemOptions?.sizeScale ??
    input.boardSettings?.sizeScale ??
    DEFAULT_SIZE_SCALE,
  textStyleId:
    input.itemOptions?.textStyleId ?? input.boardSettings?.textStyleId,
})

export const LABEL_DEFAULTS = {
  scrim: DEFAULT_SCRIM,
  sizeScale: DEFAULT_SIZE_SCALE,
} as const
