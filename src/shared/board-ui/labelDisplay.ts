// src/shared/board-ui/labelDisplay.ts
// resolves per-tile label rendering settings against board & global defaults

import type {
  BoardLabelSettings,
  ItemLabelOptions,
  LabelPlacement,
  LabelScrim,
  LabelSizeScale,
  LabelTextColor,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  LABEL_FONT_SIZE_PX_DEFAULT,
  LABEL_PLACEMENT_DEFAULT,
  LABEL_SIZE_SCALE_PX,
  normalizeLabelFontSizePx,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'

export interface ResolvedLabelDisplay
{
  placement: LabelPlacement
  scrim: LabelScrim
  // legacy enum kept on the resolved shape for downstream consumers (padding
  // tables, snapshot writes); fontSizePx drives type-scale rendering
  sizeScale: LabelSizeScale
  // resolved caption size in CSS px — derived from fontSizePx when set,
  // else mapped from sizeScale, else built-in default. always clamped.
  fontSizePx: number
  // optional caption font override; undefined -> inherit board/page font
  textStyleId: TextStyleId | undefined
  // overlay text color; 'auto' = scrim default. caption modes ignore this
  textColor: LabelTextColor
  text: string
}

const DEFAULT_SCRIM: LabelScrim = 'dark'
const DEFAULT_SIZE_SCALE: LabelSizeScale = 'md'
const DEFAULT_TEXT_COLOR: LabelTextColor = 'auto'

const clampFontSizePx = (value: number | undefined): number | undefined =>
  normalizeLabelFontSizePx(value)

const resolveFontSizePx = (
  itemFont: number | undefined,
  itemScale: LabelSizeScale | undefined,
  boardFont: number | undefined,
  boardScale: LabelSizeScale | undefined
): number =>
{
  // explicit pixel size wins, layered like everything else (item > board)
  const itemPx = clampFontSizePx(itemFont)
  if (itemPx !== undefined) return itemPx
  if (itemScale) return LABEL_SIZE_SCALE_PX[itemScale]
  const boardPx = clampFontSizePx(boardFont)
  if (boardPx !== undefined) return boardPx
  if (boardScale) return LABEL_SIZE_SCALE_PX[boardScale]
  return LABEL_FONT_SIZE_PX_DEFAULT
}

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
    fontSizePx: resolveFontSizePx(
      input.itemOptions?.fontSizePx,
      input.itemOptions?.sizeScale,
      input.boardSettings?.fontSizePx,
      input.boardSettings?.sizeScale
    ),
    textStyleId:
      input.itemOptions?.textStyleId ?? input.boardSettings?.textStyleId,
    textColor:
      input.itemOptions?.textColor ??
      input.boardSettings?.textColor ??
      DEFAULT_TEXT_COLOR,
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
  fontSizePx: resolveFontSizePx(
    input.itemOptions?.fontSizePx,
    input.itemOptions?.sizeScale,
    input.boardSettings?.fontSizePx,
    input.boardSettings?.sizeScale
  ),
  textStyleId:
    input.itemOptions?.textStyleId ?? input.boardSettings?.textStyleId,
  textColor:
    input.itemOptions?.textColor ??
    input.boardSettings?.textColor ??
    DEFAULT_TEXT_COLOR,
})

export const LABEL_DEFAULTS = {
  scrim: DEFAULT_SCRIM,
  sizeScale: DEFAULT_SIZE_SCALE,
} as const
