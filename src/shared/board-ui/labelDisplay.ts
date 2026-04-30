// src/shared/board-ui/labelDisplay.ts
// resolves per-tile label rendering settings against board & global defaults

import type {
  BoardLabelSettings,
  ItemLabelOptions,
  LabelPlacement,
  LabelScrim,
  LabelTextColor,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  LABEL_FONT_SIZE_PX_DEFAULT,
  LABEL_PLACEMENT_DEFAULT,
  normalizeLabelFontSizePx,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'

export interface ResolvedLabelDisplay
{
  placement: LabelPlacement
  scrim: LabelScrim
  fontSizePx: number
  // optional caption font override; undefined -> inherit board/page font
  textStyleId: TextStyleId | undefined
  // overlay text color; 'auto' = scrim default. caption modes ignore this
  textColor: LabelTextColor
  text: string
}

const DEFAULT_SCRIM: LabelScrim = 'dark'
const DEFAULT_TEXT_COLOR: LabelTextColor = 'auto'

const clampFontSizePx = (value: number | undefined): number | undefined =>
  normalizeLabelFontSizePx(value)

const resolveFontSizePx = (
  itemFont: number | undefined,
  boardFont: number | undefined
): number =>
{
  // explicit pixel size wins, layered like everything else (item > board)
  const itemPx = clampFontSizePx(itemFont)
  if (itemPx !== undefined) return itemPx
  const boardPx = clampFontSizePx(boardFont)
  if (boardPx !== undefined) return boardPx
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
    fontSizePx: resolveFontSizePx(
      input.itemOptions?.fontSizePx,
      input.boardSettings?.fontSizePx
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
  fontSizePx: resolveFontSizePx(
    input.itemOptions?.fontSizePx,
    input.boardSettings?.fontSizePx
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
} as const
