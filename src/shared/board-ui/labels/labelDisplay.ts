// src/shared/board-ui/labels/labelDisplay.ts
// resolves per-tile label rendering settings against board & global defaults

import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  ItemLabelOptions,
  LabelPlacement,
  LabelScrim,
  LabelTextColor,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  LABEL_FONT_SIZE_PX_DEFAULT,
  normalizeLabelFontSizePx,
  placementFromMode,
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
  boardFont: number | undefined,
  globalFont: number
): number =>
{
  // explicit px size wins by layer: item > board > global
  const itemPx = clampFontSizePx(itemFont)
  if (itemPx !== undefined) return itemPx
  const boardPx = clampFontSizePx(boardFont)
  if (boardPx !== undefined) return boardPx
  return clampFontSizePx(globalFont) ?? LABEL_FONT_SIZE_PX_DEFAULT
}

interface ResolveInput
{
  itemLabel: string | undefined
  itemOptions: ItemLabelOptions | undefined
  boardSettings: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
}

const resolvePlacement = (
  itemPlacement: LabelPlacement | undefined,
  boardPlacement: LabelPlacement | undefined,
  globalMode: GlobalLabelDefaults['placementMode']
): LabelPlacement =>
  itemPlacement ?? boardPlacement ?? placementFromMode(globalMode)

// null means no label: empty text or invisible resolved layer
export const resolveLabelDisplay = (
  input: ResolveInput
): ResolvedLabelDisplay | null =>
{
  const text = input.itemLabel?.trim() ?? ''
  if (text.length === 0) return null

  const visible =
    input.itemOptions?.visible ??
    input.boardSettings?.show ??
    input.globalLabelDefaults.showLabels
  if (!visible) return null

  return {
    placement: resolvePlacement(
      input.itemOptions?.placement,
      input.boardSettings?.placement,
      input.globalLabelDefaults.placementMode
    ),
    scrim:
      input.itemOptions?.scrim ?? input.boardSettings?.scrim ?? DEFAULT_SCRIM,
    fontSizePx: resolveFontSizePx(
      input.itemOptions?.fontSizePx,
      input.boardSettings?.fontSizePx,
      input.globalLabelDefaults.fontSizePx
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

export const resolveItemLabel = (
  item: Pick<TierItem, 'label' | 'labelOptions'>,
  boardSettings: BoardLabelSettings | undefined,
  globalLabelDefaults: GlobalLabelDefaults
): ResolvedLabelDisplay | null =>
  resolveLabelDisplay({
    itemLabel: item.label,
    itemOptions: item.labelOptions,
    boardSettings,
    globalLabelDefaults,
  })

// resolve settings w/o item text for previews & modal defaults
export const resolveLabelLayout = (
  input: Omit<ResolveInput, 'itemLabel'>
): { visible: boolean } & Omit<ResolvedLabelDisplay, 'text'> => ({
  visible:
    input.itemOptions?.visible ??
    input.boardSettings?.show ??
    input.globalLabelDefaults.showLabels,
  placement: resolvePlacement(
    input.itemOptions?.placement,
    input.boardSettings?.placement,
    input.globalLabelDefaults.placementMode
  ),
  scrim:
    input.itemOptions?.scrim ?? input.boardSettings?.scrim ?? DEFAULT_SCRIM,
  fontSizePx: resolveFontSizePx(
    input.itemOptions?.fontSizePx,
    input.boardSettings?.fontSizePx,
    input.globalLabelDefaults.fontSizePx
  ),
  textStyleId:
    input.itemOptions?.textStyleId ?? input.boardSettings?.textStyleId,
  textColor:
    input.itemOptions?.textColor ??
    input.boardSettings?.textColor ??
    DEFAULT_TEXT_COLOR,
})
