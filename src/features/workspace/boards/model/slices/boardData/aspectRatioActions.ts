// src/features/workspace/boards/model/slices/boardData/aspectRatioActions.ts
// aspect-ratio & image-fit actions for board & item display settings

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ImageFit,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  computeAutoBoardAspectRatio,
  getBoardAspectRatioMode,
} from '~/features/workspace/boards/lib/aspectRatio'
import {
  clampItemTransform,
  isIdentityTransform,
  isSameItemTransform,
} from '~/shared/lib/imageTransform'
import { isPositiveFiniteNumber } from '~/shared/lib/typeGuards'
import { withUndo } from '../undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  BoardDataSlice,
} from '../types'

type AspectRatioActions = Pick<
  BoardDataSlice,
  | 'setBoardItemAspectRatio'
  | 'setBoardAspectRatioMode'
  | 'setItemImageFit'
  | 'setItemsImageFit'
  | 'setAspectRatioPromptDismissed'
  | 'setDefaultItemImageFit'
  | 'setItemTransform'
  | 'setItemsTransform'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

const buildItemsImageFitPatch = (
  state: ActiveBoardStore,
  itemIds: readonly ItemId[],
  fit: ImageFit | null
): Partial<ActiveBoardStore> | null =>
{
  if (itemIds.length === 0) return null
  const nextFit = fit ?? undefined
  let nextItems: ActiveBoardStore['items'] | null = null

  for (const id of itemIds)
  {
    const item = state.items[id]
    if (!item || (nextFit === item.imageFit && !item.transform)) continue
    const { transform: _transform, ...rest } = item
    nextItems ??= { ...state.items }
    nextItems[id] = { ...rest, imageFit: nextFit }
  }

  return nextItems
    ? withUndo(state, { items: nextItems }, 'Change image fit')
    : null
}

const applySavedTransform = (
  item: TierItem,
  savedTransform: ItemTransform | undefined
): TierItem =>
{
  if (savedTransform) return { ...item, transform: savedTransform }
  const { transform: _transform, ...rest } = item
  return rest
}

export const createAspectRatioActions = (
  set: SliceArgs[0]
): AspectRatioActions => ({
  setBoardItemAspectRatio: (value) =>
    set((state) =>
    {
      if (!isPositiveFiniteNumber(value)) return state
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
    set((state) => buildItemsImageFitPatch(state, [itemId], fit) ?? state),

  setItemsImageFit: (itemIds, fit) =>
    set((state) => buildItemsImageFitPatch(state, itemIds, fit) ?? state),

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
      const nextItem = applySavedTransform(item, savedTransform)
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

  setItemsTransform: (entries) =>
    set((state) =>
    {
      if (entries.length === 0) return state
      let nextItems: ActiveBoardStore['items'] | null = null
      for (const { id, transform } of entries)
      {
        const item = state.items[id]
        if (!item) continue
        const clamped = transform ? clampItemTransform(transform) : undefined
        const saved =
          clamped && !isIdentityTransform(clamped) ? clamped : undefined
        if (isSameItemTransform(item.transform, saved)) continue
        nextItems ??= { ...state.items }
        nextItems[id] = applySavedTransform(item, saved)
      }
      if (!nextItems) return state
      return withUndo(state, { items: nextItems }, 'Adjust images')
    }),
})
