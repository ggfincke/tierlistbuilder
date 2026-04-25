// src/features/workspace/boards/model/slices/boardData/aspectRatioActions.ts
// aspect-ratio & image-fit actions for board & item display settings

import {
  computeAutoBoardAspectRatio,
  getBoardAspectRatioMode,
} from '~/features/workspace/boards/lib/aspectRatio'
import {
  clampItemTransform,
  isIdentityTransform,
  isSameItemTransform,
} from '~/shared/lib/imageTransform'
import { withUndo } from '../undoSlice'
import type { ActiveBoardSliceCreator, BoardDataSlice } from '../types'

type AspectRatioActions = Pick<
  BoardDataSlice,
  | 'setBoardItemAspectRatio'
  | 'setBoardAspectRatioMode'
  | 'setItemImageFit'
  | 'setItemsImageFit'
  | 'setAspectRatioPromptDismissed'
  | 'setDefaultItemImageFit'
  | 'setItemTransform'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

export const createAspectRatioActions = (
  set: SliceArgs[0]
): AspectRatioActions => ({
  setBoardItemAspectRatio: (value) =>
    set((state) =>
    {
      if (!Number.isFinite(value) || value <= 0) return state
      if (
        state.itemAspectRatioMode === 'manual' &&
        state.itemAspectRatio === value
      )
      {
        return state
      }
      return withUndo(
        state,
        {
          itemAspectRatio: value,
          itemAspectRatioMode: 'manual',
        },
        'Set aspect ratio'
      )
    }),

  setBoardAspectRatioMode: (mode) =>
    set((state) =>
    {
      const currentMode = getBoardAspectRatioMode(state)
      if (mode === currentMode) return state
      if (mode === 'manual')
      {
        return withUndo(
          state,
          { itemAspectRatioMode: 'manual' },
          'Pin aspect ratio'
        )
      }
      const computed = computeAutoBoardAspectRatio(state)
      return withUndo(
        state,
        {
          itemAspectRatioMode: 'auto',
          itemAspectRatio: computed ?? state.itemAspectRatio,
        },
        'Auto aspect ratio'
      )
    }),

  setItemImageFit: (itemId, fit) =>
    set((state) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      const nextFit = fit ?? undefined
      if (nextFit === item.imageFit && !item.transform) return state
      const { transform: _transform, ...rest } = item
      return withUndo(
        state,
        {
          items: {
            ...state.items,
            [itemId]: { ...rest, imageFit: nextFit },
          },
        },
        'Change image fit'
      )
    }),

  setItemsImageFit: (itemIds, fit) =>
    set((state) =>
    {
      if (itemIds.length === 0) return state
      const nextFit = fit ?? undefined
      const nextItems = { ...state.items }
      let changed = false
      for (const id of itemIds)
      {
        const item = nextItems[id]
        if (!item || (nextFit === item.imageFit && !item.transform)) continue
        const { transform: _transform, ...rest } = item
        nextItems[id] = { ...rest, imageFit: nextFit }
        changed = true
      }
      if (!changed) return state
      return withUndo(state, { items: nextItems }, 'Change image fit')
    }),

  setAspectRatioPromptDismissed: (dismissed) =>
    set((state) =>
    {
      const current = state.aspectRatioPromptDismissed === true
      if (current === dismissed) return state
      return { aspectRatioPromptDismissed: dismissed ? true : undefined }
    }),

  setDefaultItemImageFit: (fit) =>
    set((state) =>
    {
      const nextFit = fit ?? undefined
      if (nextFit === state.defaultItemImageFit) return state
      return withUndo(
        state,
        { defaultItemImageFit: nextFit },
        'Set default fit'
      )
    }),

  setItemTransform: (itemId, transform) =>
    set((state) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      // clamp incoming transform values to the contract's bounds; the editor
      // can pass raw drag deltas without pre-validating them
      const nextTransform = transform
        ? clampItemTransform(transform)
        : undefined
      const savedTransform =
        nextTransform && !isIdentityTransform(nextTransform)
          ? nextTransform
          : undefined
      if (isSameItemTransform(item.transform, savedTransform)) return state
      const { transform: _existingTransform, ...rest } = item
      const nextItem = savedTransform
        ? { ...item, transform: savedTransform }
        : rest
      return withUndo(
        state,
        {
          items: {
            ...state.items,
            [itemId]: nextItem,
          },
        },
        savedTransform ? 'Adjust image' : 'Reset image adjustment'
      )
    }),
})
