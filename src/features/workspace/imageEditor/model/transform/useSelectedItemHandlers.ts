// src/features/workspace/imageEditor/model/transform/useSelectedItemHandlers.ts
// selected-item wrappers for image editor pane commits & metadata edits

import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type { BoardDataSlice } from '~/features/workspace/boards/model/slices/types'

type ItemTransformInput = Parameters<BoardDataSlice['setItemTransform']>[1]
type ItemLabelOptionsInput = Parameters<
  BoardDataSlice['setItemLabelOptions']
>[1]

interface UseSelectedItemHandlersInput
{
  selectedId: ItemId | null
  onCommit: (id: ItemId, transform: ItemTransformInput) => void
  requestApplyLabelToAll: (sourceId: ItemId) => void
}

export const useSelectedItemHandlers = ({
  selectedId,
  onCommit,
  requestApplyLabelToAll,
}: UseSelectedItemHandlersInput) =>
{
  const {
    setItemAltText,
    setItemBackgroundColor,
    setItemLabel,
    setItemLabelOptions,
    setItemNotes,
  } = useActiveBoardStore(
    useShallow((s) => ({
      setItemAltText: s.setItemAltText,
      setItemBackgroundColor: s.setItemBackgroundColor,
      setItemLabel: s.setItemLabel,
      setItemLabelOptions: s.setItemLabelOptions,
      setItemNotes: s.setItemNotes,
    }))
  )

  const withSelectedItem = useCallback(
    <Args extends readonly unknown[]>(
      run: (id: ItemId, ...args: Args) => void
    ) =>
      (...args: Args) =>
      {
        if (!selectedId) return
        run(selectedId, ...args)
      },
    [selectedId]
  )

  return useMemo(
    () => ({
      handleSelectedAltTextChange: withSelectedItem((id, value: string) =>
        setItemAltText(id, value)
      ),
      handleSelectedApplyLabelToAll: withSelectedItem((id) =>
        requestApplyLabelToAll(id)
      ),
      handleSelectedBackgroundColorChange: withSelectedItem(
        (id, value: string | null) => setItemBackgroundColor(id, value)
      ),
      handleSelectedCommit: withSelectedItem(
        (id, transform: ItemTransformInput) => onCommit(id, transform)
      ),
      handleSelectedLabelChange: withSelectedItem((id, label: string) =>
        setItemLabel(id, label)
      ),
      handleSelectedLabelOptionsChange: withSelectedItem(
        (id, options: ItemLabelOptionsInput) => setItemLabelOptions(id, options)
      ),
      handleSelectedNotesChange: withSelectedItem((id, value: string) =>
        setItemNotes(id, value)
      ),
    }),
    [
      onCommit,
      requestApplyLabelToAll,
      setItemAltText,
      setItemBackgroundColor,
      setItemLabel,
      setItemLabelOptions,
      setItemNotes,
      withSelectedItem,
    ]
  )
}
