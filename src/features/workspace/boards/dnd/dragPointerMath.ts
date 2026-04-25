// src/features/workspace/boards/dnd/dragPointerMath.ts
// pointer & mouse insertion math for drag-&-drop targeting

import type { ClientRect, Translate } from '@dnd-kit/core'

import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { brandedStringArrayIndexOf } from '~/shared/lib/typeGuards'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  findContainer,
  getItemsInContainer,
  moveItemInSnapshot,
} from './dragSnapshot'

interface GetDraggedItemRectArgs
{
  translatedRect: ClientRect | null
  initialRect: ClientRect | null
  delta: Translate
}

interface ResolveDragTargetIndexArgs
{
  draggedRect: ClientRect | null
  overRect: ClientRect
  overId: string
  overContainerId: string
  overIndex: number
  overItemsLength: number
}

interface ResolveNextDragPreviewArgs
{
  snapshot: ContainerSnapshot
  itemId: ItemId
  overId: string
  draggedRect: ClientRect | null
  overRect: ClientRect
}

export const getDraggedItemRect = ({
  translatedRect,
  initialRect,
  delta,
}: GetDraggedItemRectArgs): ClientRect | null =>
{
  if (translatedRect)
  {
    return translatedRect
  }

  if (!initialRect)
  {
    return null
  }

  return {
    ...initialRect,
    top: initialRect.top + delta.y,
    bottom: initialRect.bottom + delta.y,
    left: initialRect.left + delta.x,
    right: initialRect.right + delta.x,
  }
}

// preserve the normal between-item threshold while honoring explicit front/back drops

export const resolveDragTargetIndex = ({
  draggedRect,
  overRect,
  overId,
  overContainerId,
  overIndex,
  overItemsLength,
}: ResolveDragTargetIndexArgs): number =>
{
  if (overId === overContainerId)
  {
    return overItemsLength
  }

  if (draggedRect && overIndex === 0 && draggedRect.left < overRect.left)
  {
    return 0
  }

  if (
    draggedRect &&
    overIndex === overItemsLength - 1 &&
    draggedRect.right > overRect.right
  )
  {
    return overItemsLength
  }

  const draggedMidX = draggedRect
    ? draggedRect.left + draggedRect.width / 2
    : overRect.left + overRect.width / 2
  const overMidX = overRect.left + overRect.width / 2

  return draggedMidX > overMidX ? overIndex + 1 : overIndex
}

export const resolveNextDragPreview = ({
  snapshot,
  itemId,
  overId,
  draggedRect,
  overRect,
}: ResolveNextDragPreviewArgs): ContainerSnapshot =>
{
  const fromContainerId = findContainer(snapshot, itemId)
  const toContainerId = findContainer(snapshot, overId)

  if (!fromContainerId || !toContainerId)
  {
    return snapshot
  }

  const sourceItems = getItemsInContainer(snapshot, fromContainerId)
  const targetItems = getItemsInContainer(snapshot, toContainerId)
  const sourceIndex = sourceItems.indexOf(itemId)
  const overIndex = brandedStringArrayIndexOf(targetItems, overId)
  const targetIndex = resolveDragTargetIndex({
    draggedRect,
    overRect,
    overId,
    overContainerId: toContainerId,
    overIndex,
    overItemsLength: targetItems.length,
  })

  if (sourceIndex < 0 || targetIndex < 0)
  {
    return snapshot
  }

  if (
    fromContainerId === toContainerId &&
    (sourceIndex === targetIndex || sourceIndex === targetIndex - 1)
  )
  {
    return snapshot
  }

  return moveItemInSnapshot(
    snapshot,
    itemId,
    fromContainerId,
    toContainerId,
    targetIndex
  )
}
