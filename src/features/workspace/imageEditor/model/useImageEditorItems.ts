// src/features/workspace/imageEditor/model/useImageEditorItems.ts
// ordered image-item collection, filtering, & pending edit overlays

import { useCallback, useMemo } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { Tier, TierItem } from '@tierlistbuilder/contracts/workspace/board'
import { itemHasAspectMismatch } from '~/shared/board-ui/aspectRatio'
import { hasAnyImageRef } from '~/shared/lib/imageRefs'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import type { ImageEditorFilter } from '~/features/workspace/imageEditor/model/useImageEditorStore'
import type { PendingImageEditorPaneEdit } from '~/features/workspace/imageEditor/model/pendingImageEdit'

interface ImageEditorItemsInput
{
  items: Readonly<Record<ItemId, TierItem>>
  tiers: readonly Tier[]
  unrankedItemIds: readonly ItemId[]
}

interface UseImageEditorItemsInput extends ImageEditorItemsInput
{
  filter: ImageEditorFilter
  boardAspectRatio: number
}

const collectImageEditorItems = ({
  items,
  tiers,
  unrankedItemIds,
}: ImageEditorItemsInput): TierItem[] =>
{
  const result: TierItem[] = []
  const seen = new Set<ItemId>()
  const visitId = (id: ItemId): void =>
  {
    if (seen.has(id)) return
    seen.add(id)
    const item = items[id]
    if (item && hasAnyImageRef(item)) result.push(item)
  }

  for (const tier of tiers)
  {
    for (const id of tier.itemIds) visitId(id)
  }
  for (const id of unrankedItemIds) visitId(id)

  return result
}

const filterImageEditorItems = (
  items: readonly TierItem[],
  filter: ImageEditorFilter,
  boardAspectRatio: number
): readonly TierItem[] =>
{
  if (filter === 'mismatched')
  {
    return items.filter((it) => itemHasAspectMismatch(it, boardAspectRatio))
  }
  if (filter === 'adjusted')
  {
    return items.filter(
      (it) => !!it.transform && !isIdentityTransform(it.transform)
    )
  }
  return items
}

const applyPendingImageEditorEdit = (
  items: readonly TierItem[],
  pendingEdit: PendingImageEditorPaneEdit | null
): readonly TierItem[] =>
{
  if (!pendingEdit) return items
  let matched = false
  const nextItems = items.map((it) =>
  {
    if (it.id !== pendingEdit.id) return it
    matched = true
    return {
      ...it,
      transform: pendingEdit.transform ?? undefined,
    }
  })
  return matched ? nextItems : items
}

export const useImageEditorItems = ({
  items,
  tiers,
  unrankedItemIds,
  filter,
  boardAspectRatio,
}: UseImageEditorItemsInput) =>
{
  const allImageItems = useMemo(
    () => collectImageEditorItems({ items, tiers, unrankedItemIds }),
    [items, tiers, unrankedItemIds]
  )

  const filteredItems = useMemo(
    () => filterImageEditorItems(allImageItems, filter, boardAspectRatio),
    [filter, allImageItems, boardAspectRatio]
  )

  const getItemsWithPendingEdit = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): readonly TierItem[] =>
      applyPendingImageEditorEdit(filteredItems, pendingEdit),
    [filteredItems]
  )

  return {
    allImageItems,
    filteredItems,
    getItemsWithPendingEdit,
  }
}
