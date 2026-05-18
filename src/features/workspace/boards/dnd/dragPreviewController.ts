// src/features/workspace/boards/dnd/dragPreviewController.ts
// drag preview helpers — keep the transient snapshot aligned to pointer movement

import type { MutableRefObject } from 'react'
import type { DragMoveEvent, DragOverEvent } from '@dnd-kit/core'

import { toItemId, toStringId } from '~/features/workspace/boards/dnd/dragHelpers'
import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { TRASH_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { findContainer } from '~/features/workspace/boards/dnd/dragSnapshot'
import {
  getDraggedItemRect,
  resolveNextDragPreview,
} from '~/features/workspace/boards/dnd/dragPointerMath'

interface DragPositionEvent
{
  active: DragMoveEvent['active']
  over: DragMoveEvent['over'] | DragOverEvent['over']
  delta: DragMoveEvent['delta']
}

export const syncDraggedItemPosition = (
  event: DragPositionEvent,
  preview: ContainerSnapshot,
  movedToNewContainerRef: MutableRefObject<boolean>,
  updateDragPreview: (preview: ContainerSnapshot) => void
): boolean =>
{
  if (!event.over)
  {
    return false
  }

  const activeId = toItemId(event.active.id)
  const overId = toStringId(event.over.id)

  if (!activeId || !overId || activeId === overId)
  {
    return false
  }

  if (overId === TRASH_CONTAINER_ID)
  {
    return false
  }

  const nextPreview = resolveNextDragPreview({
    snapshot: preview,
    itemId: activeId,
    overId,
    draggedRect: getDraggedItemRect({
      translatedRect: event.active.rect.current.translated,
      initialRect: event.active.rect.current.initial,
      delta: event.delta,
    }),
    overRect: event.over.rect,
  })

  if (nextPreview === preview)
  {
    return false
  }

  movedToNewContainerRef.current =
    findContainer(preview, activeId) !== findContainer(nextPreview, activeId)
  updateDragPreview(nextPreview)
  return true
}
