// src/features/workspace/boards/model/slices/board-data-actions/deletedItemActions.ts
// deleted-item buffer actions for restore, discard, & clear

import { withUndo } from '~/features/workspace/boards/model/slices/undoSlice'
import type {
  ActiveBoardSliceCreator,
  BoardDataSlice,
} from '~/features/workspace/boards/model/slices/types'

type DeletedItemActions = Pick<
  BoardDataSlice,
  'restoreDeletedItem' | 'permanentlyDeleteItem' | 'clearDeletedItems'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

export const createDeletedItemActions = (
  set: SliceArgs[0]
): DeletedItemActions => ({
  restoreDeletedItem: (itemId) =>
    set((state) =>
    {
      const item = state.deletedItems.find((entry) => entry.id === itemId)

      if (!item)
      {
        return state
      }

      return {
        ...withUndo(state, {}, 'Restore item'),
        items: { ...state.items, [item.id]: item },
        unrankedItemIds: [...state.unrankedItemIds, item.id],
        deletedItems: state.deletedItems.filter((entry) => entry.id !== itemId),
        activeItemCount: state.activeItemCount + 1,
      }
    }),

  permanentlyDeleteItem: (itemId) =>
    set((state) =>
      withUndo(
        state,
        {
          deletedItems: state.deletedItems.filter(
            (entry) => entry.id !== itemId
          ),
        },
        'Discard item'
      )
    ),

  clearDeletedItems: () =>
    set((state) =>
      withUndo(
        state,
        {
          deletedItems: [],
        },
        'Empty trash'
      )
    ),
})
