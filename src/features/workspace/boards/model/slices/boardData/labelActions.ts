// src/features/workspace/boards/model/slices/boardData/labelActions.ts
// per-board label defaults & per-tile label override actions

import {
  boardLabelSettingsEqual,
  isEmptyBoardLabelSettings,
  isEmptyItemLabelOptions,
  itemLabelOptionsEqual,
} from '@tierlistbuilder/contracts/workspace/board'
import { withUndo } from '../undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  BoardDataSlice,
} from '../types'

type LabelActions = Pick<
  BoardDataSlice,
  | 'setBoardLabelSettings'
  | 'setItemLabelOptions'
  | 'setBoardAndItemsLabelOptions'
  | 'setItemLabel'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

export const createLabelActions = (set: SliceArgs[0]): LabelActions => ({
  setBoardLabelSettings: (settings) =>
    set((state: ActiveBoardStore) =>
    {
      const next =
        settings && !isEmptyBoardLabelSettings(settings) ? settings : undefined
      if (boardLabelSettingsEqual(state.labels, next)) return state
      return withUndo(state, { labels: next }, 'Update label settings')
    }),

  setItemLabelOptions: (itemId, options) =>
    set((state: ActiveBoardStore) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      const next =
        options && !isEmptyItemLabelOptions(options) ? options : undefined
      if (itemLabelOptionsEqual(item.labelOptions, next)) return state
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

  setBoardAndItemsLabelOptions: (settings, entries) =>
    set((state: ActiveBoardStore) =>
    {
      const nextLabels =
        settings && !isEmptyBoardLabelSettings(settings) ? settings : undefined
      const updates: Partial<ActiveBoardStore> = {}
      if (!boardLabelSettingsEqual(state.labels, nextLabels))
      {
        updates.labels = nextLabels
      }

      let nextItems: ActiveBoardStore['items'] | null = null
      for (const { id, options } of entries)
      {
        const item = state.items[id]
        if (!item) continue
        const nextOptions =
          options && !isEmptyItemLabelOptions(options) ? options : undefined
        if (itemLabelOptionsEqual(item.labelOptions, nextOptions)) continue
        const { labelOptions: _drop, ...rest } = item
        nextItems ??= { ...state.items }
        nextItems[id] = nextOptions
          ? { ...rest, labelOptions: nextOptions }
          : rest
      }

      if (nextItems) updates.items = nextItems
      if (Object.keys(updates).length === 0) return state
      return withUndo(state, updates, 'Update labels')
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
