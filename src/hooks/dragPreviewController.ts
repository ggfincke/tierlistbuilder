// src/hooks/dragPreviewController.ts
// drag preview helpers — keep the transient snapshot aligned to pointer movement

import type { MutableRefObject } from 'react'
import type {
  DragMoveEvent,
  DragOverEvent,
  UniqueIdentifier,
} from '@dnd-kit/core'

import { useTierListStore } from '../store/useTierListStore'
import type { ContainerSnapshot } from '../types'
import { TRASH_CONTAINER_ID } from '../utils/constants'
import {
  findContainer,
  getEffectiveContainerSnapshot,
} from '../utils/dragSnapshot'
import {
  getDraggedItemRect,
  resolveNextDragPreview,
} from '../utils/dragPointerMath'

interface DragPositionEvent
{
  active: DragMoveEvent['active']
  over: DragMoveEvent['over'] | DragOverEvent['over']
  delta: DragMoveEvent['delta']
}

const toStringId = (id: UniqueIdentifier): string | null =>
  typeof id === 'string' ? id : null

export const syncDraggedItemPosition = (
  event: DragPositionEvent,
  movedToNewContainerRef: MutableRefObject<boolean>,
  updateDragPreview: (preview: ContainerSnapshot) => void
): boolean =>
{
  if (!event.over)
  {
    return false
  }

  const activeId = toStringId(event.active.id)
  const overId = toStringId(event.over.id)

  if (!activeId || !overId || activeId === overId)
  {
    return false
  }

  if (overId === TRASH_CONTAINER_ID)
  {
    return false
  }

  const preview = getEffectiveContainerSnapshot(useTierListStore.getState())
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
