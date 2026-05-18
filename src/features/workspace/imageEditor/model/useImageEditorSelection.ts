// src/features/workspace/imageEditor/model/useImageEditorSelection.ts
// selected image-editor item navigation & skip state

import { useCallback, useMemo, useState } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { TierItem } from '@tierlistbuilder/contracts/workspace/board'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import type { ImageEditorFilter } from '~/features/workspace/imageEditor/model/useImageEditorStore'

interface UseImageEditorSelectionInput
{
  initialItemId: ItemId | null
  allImageItems: readonly TierItem[]
  filteredItems: readonly TierItem[]
  filter: ImageEditorFilter
}

export const useImageEditorSelection = ({
  initialItemId,
  allImageItems,
  filteredItems,
  filter,
}: UseImageEditorSelectionInput) =>
{
  const [pickedId, setPickedId] = useState<ItemId | null>(() =>
  {
    if (initialItemId && allImageItems.some((it) => it.id === initialItemId))
    {
      return initialItemId
    }
    return null
  })

  const selectedIndex = useMemo(() =>
  {
    if (pickedId)
    {
      const idx = filteredItems.findIndex((it) => it.id === pickedId)
      if (idx >= 0) return idx
    }
    return filteredItems.length > 0 ? 0 : -1
  }, [pickedId, filteredItems])

  const selectedItem =
    selectedIndex >= 0 ? filteredItems[selectedIndex] : undefined
  const selectedId = selectedItem?.id ?? null

  const goPrev = useCallback(() =>
  {
    if (selectedIndex <= 0) return
    setPickedId(filteredItems[selectedIndex - 1].id)
  }, [selectedIndex, filteredItems])

  const [skippedIds, setSkippedIds] = useState<ReadonlySet<ItemId>>(
    () => new Set()
  )

  const isSkipped = useCallback(
    (id: ItemId) => skippedIds.has(id),
    [skippedIds]
  )

  const goSkip = useCallback(() =>
  {
    if (selectedIndex < 0 || selectedIndex >= filteredItems.length - 1) return
    const currentId = filteredItems[selectedIndex].id
    setSkippedIds((prev) =>
    {
      if (prev.has(currentId)) return prev
      const next = new Set(prev)
      next.add(currentId)
      return next
    })
    setPickedId(filteredItems[selectedIndex + 1].id)
  }, [selectedIndex, filteredItems])

  const goNext = useCallback(() =>
  {
    if (selectedIndex < 0 || selectedIndex >= filteredItems.length - 1) return
    if (filter === 'mismatched')
    {
      for (let i = selectedIndex + 1; i < filteredItems.length; i += 1)
      {
        const it = filteredItems[i]
        if (skippedIds.has(it.id)) continue
        if (!it.transform || isIdentityTransform(it.transform))
        {
          setPickedId(it.id)
          return
        }
      }
    }
    setPickedId(filteredItems[selectedIndex + 1].id)
  }, [filter, selectedIndex, filteredItems, skippedIds])

  const clearSkipped = useCallback((id: ItemId) =>
  {
    setSkippedIds((prev) =>
    {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  return {
    selectedIndex,
    selectedItem,
    selectedId,
    setPickedId,
    goPrev,
    goNext,
    goSkip,
    isSkipped,
    clearSkipped,
  }
}
