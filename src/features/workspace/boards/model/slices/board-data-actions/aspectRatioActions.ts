// src/features/workspace/boards/model/slices/board-data-actions/aspectRatioActions.ts
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
} from '~/shared/board-ui/aspectRatio'
import { normalizeBoardItemAspectRatio } from '@tierlistbuilder/contracts/workspace/aspectRatio'

import { clampImagePadding } from '@tierlistbuilder/contracts/workspace/board'
import {
  clampItemTransform,
  isIdentityTransform,
  isSameItemTransform,
} from '~/shared/lib/imageTransform'
import { withUndo } from '~/features/workspace/boards/model/slices/undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  BoardDataSlice,
} from '~/features/workspace/boards/model/slices/types'

type AspectRatioActions = Pick<
  BoardDataSlice,
  | 'setBoardItemAspectRatio'
  | 'setBoardAspectRatioMode'
  | 'setItemImageFit'
  | 'setItemsImageFit'
  | 'setAspectRatioPromptDismissed'
  | 'setDefaultItemImageFit'
  | 'setItemImagePadding'
  | 'setDefaultItemImagePadding'
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

// a manual recrop makes an item user-owned ('pinned') so a later skin switch
// leaves it untouched; a reset reverts to 'linked' so it follows the skin again.
// only the manual single-item editor commit pins -- bulk auto-crop stays linked
// (re-derivable) so auto-cropping a board doesn't disable skin-switching
const applyManualTransformPin = (
  item: TierItem,
  savedTransform: ItemTransform | undefined
): TierItem =>
{
  const next = applySavedTransform(item, savedTransform)
  if (savedTransform) return { ...next, imageSource: 'pinned' }
  const { imageSource: _imageSource, ...rest } = next
  return rest
}

export const createAspectRatioActions = (
  set: SliceArgs[0]
): AspectRatioActions => ({
  setBoardItemAspectRatio: (value) =>
    set((state) =>
    {
      const nextRatio = normalizeBoardItemAspectRatio(value)
      if (nextRatio === undefined) return state
      if (
        state.itemAspectRatioMode === 'manual' &&
        state.itemAspectRatio === nextRatio
      )
      {
        return state
      }
      return withUndo(
        state,
        {
          itemAspectRatio: nextRatio,
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
      const fallback = normalizeBoardItemAspectRatio(state.itemAspectRatio)
      return withUndo(
        state,
        {
          itemAspectRatioMode: 'auto',
          itemAspectRatio: computed ?? fallback,
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

  // padding is orthogonal to imageFit/transform, so this leaves both untouched
  // (unlike the fit setter, which clears a stale manual transform)
  setItemImagePadding: (itemId, padding) =>
    set((state) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      const next = padding == null ? undefined : clampImagePadding(padding)
      if ((item.imagePadding ?? undefined) === next) return state
      const { imagePadding: _imagePadding, ...rest } = item
      const nextItem =
        next === undefined ? rest : { ...rest, imagePadding: next }
      return withUndo(
        state,
        { items: { ...state.items, [itemId]: nextItem } },
        next === undefined ? 'Reset image padding' : 'Adjust image padding'
      )
    }),

  setDefaultItemImagePadding: (padding) =>
    set((state) =>
    {
      const next = padding == null ? undefined : clampImagePadding(padding)
      if (next === state.defaultItemImagePadding) return state
      return withUndo(
        state,
        { defaultItemImagePadding: next },
        'Set default padding'
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
      const nextItem = applyManualTransformPin(item, savedTransform)
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
