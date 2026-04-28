// src/features/workspace/boards/model/slices/boardData/labelActions.ts
// per-board label defaults & per-tile label override actions

import type {
  BoardLabelSettings,
  ItemLabelOptions,
  LabelPlacement,
} from '@tierlistbuilder/contracts/workspace/board'
import { withUndo } from '../undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  BoardDataSlice,
} from '../types'

type LabelActions = Pick<
  BoardDataSlice,
  'setBoardLabelSettings' | 'setItemLabelOptions' | 'setItemLabel'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

const isEmptyLabelSettings = (
  settings: BoardLabelSettings | undefined
): boolean =>
  !settings ||
  (settings.show === undefined &&
    settings.placement === undefined &&
    settings.scrim === undefined &&
    settings.sizeScale === undefined &&
    settings.textStyleId === undefined)

const isEmptyLabelOptions = (options: ItemLabelOptions | undefined): boolean =>
  !options ||
  (options.visible === undefined &&
    options.placement === undefined &&
    options.scrim === undefined &&
    options.sizeScale === undefined &&
    options.textStyleId === undefined)

// placements are discriminated unions — string-equal `mode` plus structural
// compare of overlay coordinates. caption modes carry no extra fields
const labelPlacementsEqual = (
  a: LabelPlacement | undefined,
  b: LabelPlacement | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  if (a.mode !== b.mode) return false
  if (a.mode === 'overlay' && b.mode === 'overlay')
  {
    return a.x === b.x && a.y === b.y
  }
  return true
}

const labelSettingsEqual = (
  a: BoardLabelSettings | undefined,
  b: BoardLabelSettings | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (
    a.show === b.show &&
    labelPlacementsEqual(a.placement, b.placement) &&
    a.scrim === b.scrim &&
    a.sizeScale === b.sizeScale &&
    a.textStyleId === b.textStyleId
  )
}

const labelOptionsEqual = (
  a: ItemLabelOptions | undefined,
  b: ItemLabelOptions | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (
    a.visible === b.visible &&
    labelPlacementsEqual(a.placement, b.placement) &&
    a.scrim === b.scrim &&
    a.sizeScale === b.sizeScale &&
    a.textStyleId === b.textStyleId
  )
}

export const createLabelActions = (set: SliceArgs[0]): LabelActions => ({
  setBoardLabelSettings: (settings) =>
    set((state: ActiveBoardStore) =>
    {
      const next =
        settings && !isEmptyLabelSettings(settings) ? settings : undefined
      if (labelSettingsEqual(state.labels, next)) return state
      return withUndo(state, { labels: next }, 'Update label settings')
    }),

  setItemLabelOptions: (itemId, options) =>
    set((state: ActiveBoardStore) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      const next =
        options && !isEmptyLabelOptions(options) ? options : undefined
      if (labelOptionsEqual(item.labelOptions, next)) return state
      const { labelOptions: _drop, ...rest } = item
      const nextItem = next ? { ...rest, labelOptions: next } : rest
      return withUndo(
        state,
        {
          items: { ...state.items, [itemId]: nextItem },
        },
        'Update label'
      )
    }),

  setItemLabel: (itemId, label) =>
    set((state: ActiveBoardStore) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      const trimmed = label?.trim() ?? ''
      const next = trimmed.length > 0 ? trimmed : undefined
      if (item.label === next) return state
      const { label: _drop, ...rest } = item
      const nextItem = next ? { ...rest, label: next } : rest
      return withUndo(
        state,
        {
          items: { ...state.items, [itemId]: nextItem },
        },
        'Edit label'
      )
    }),
})
