// src/hooks/useDragAndDrop.ts
// * drag-&-drop hook — wires dnd-kit sensors, collision detection, & item move logic

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { resolveDragCollisions } from './dragCollision'
import { syncDraggedItemPosition } from './dragPreviewController'
import { useDragSensors } from './dragSensors'
import { useTierListStore } from '../store/useTierListStore'
import { TRASH_CONTAINER_ID } from '../utils/constants'
import {
  findContainer,
  getEffectiveContainerSnapshot,
} from '../utils/dragSnapshot'
import { captureRenderedContainerSnapshot } from '../utils/dragDomCapture'

const toStringId = (id: UniqueIdentifier): string | null =>
{
  return typeof id === 'string' ? id : null
}

// * primary drag-&-drop hook consumed by TierList
export const useDragAndDrop = () =>
{
  const items = useTierListStore((state) => state.items)
  const dragPreview = useTierListStore((state) => state.dragPreview)
  const activeItemId = useTierListStore((state) => state.activeItemId)
  const keyboardMode = useTierListStore((state) => state.keyboardMode)
  const setActiveItemId = useTierListStore((state) => state.setActiveItemId)
  const clearKeyboardMode = useTierListStore((state) => state.clearKeyboardMode)
  const beginDragPreview = useTierListStore((state) => state.beginDragPreview)
  const updateDragPreview = useTierListStore((state) => state.updateDragPreview)
  const commitDragPreview = useTierListStore((state) => state.commitDragPreview)
  const discardDragPreview = useTierListStore(
    (state) => state.discardDragPreview
  )
  const removeItem = useTierListStore((state) => state.removeItem)
  const [showDragOverlay, setShowDragOverlay] = useState(false)
  // last resolved over-ID — used as fallback when pointer leaves all droppables
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null)
  // flag set when the dragged item crosses into a new container mid-drag
  const movedToNewContainerRef = useRef(false)

  const sensors = useDragSensors()

  // reset the cross-container flag on the next animation frame after layout settles
  useEffect(() =>
  {
    const frame = requestAnimationFrame(() =>
    {
      movedToNewContainerRef.current = false
    })

    return () => cancelAnimationFrame(frame)
  }, [dragPreview])

  useEffect(() =>
  {
    if (keyboardMode === 'idle')
    {
      return
    }

    // exit keyboard browse/drag mode on the first pointer interaction
    const handlePointerDown = () =>
    {
      const state = useTierListStore.getState()

      if (state.keyboardMode === 'dragging')
      {
        state.discardDragPreview()
        state.setActiveItemId(null)
      }

      state.clearKeyboardMode()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)

    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [keyboardMode])

  const collisionDetection = useCallback(
    (args: Parameters<typeof resolveDragCollisions>[0]) =>
      resolveDragCollisions(args, lastOverIdRef, movedToNewContainerRef),
    []
  )

  // clear all drag-tracking refs & deactivate the overlay
  const resetDragState = () =>
  {
    lastOverIdRef.current = null
    movedToNewContainerRef.current = false
    setShowDragOverlay(false)
    setActiveItemId(null)
  }

  // capture snapshot & mark active item when drag begins
  const onDragStart = (event: DragStartEvent) =>
  {
    const activeId = toStringId(event.active.id)
    if (!activeId)
    {
      return
    }

    beginDragPreview()
    lastOverIdRef.current = activeId
    clearKeyboardMode()
    setShowDragOverlay(true)
    setActiveItemId(activeId)
  }

  // live-update item position as pointer moves over containers & items
  const onDragMove = (event: DragMoveEvent) =>
  {
    syncDraggedItemPosition(event, movedToNewContainerRef, updateDragPreview)
  }

  // respond immediately when the active item enters a different droppable target
  const onDragOver = (event: DragOverEvent) =>
  {
    syncDraggedItemPosition(event, movedToNewContainerRef, updateDragPreview)
  }

  // commit the exact preview that was rendered, or discard it when dropped outside
  const onDragEnd = (event: DragEndEvent) =>
  {
    const activeId = toStringId(event.active.id)

    if (!event.over)
    {
      discardDragPreview()
      resetDragState()
      return
    }

    const overId = toStringId(event.over.id)

    // drop on trash — discard preview & remove the item
    if (overId === TRASH_CONTAINER_ID && activeId)
    {
      discardDragPreview()
      removeItem(activeId)
      resetDragState()
      return
    }

    if (activeId && overId)
    {
      const preview = getEffectiveContainerSnapshot(useTierListStore.getState())
      const activeContainerId = findContainer(preview, activeId)
      const overContainerId = findContainer(preview, overId)

      // scope the DOM capture to only the active container to avoid
      // overwriting uninvolved containers w/ potentially stale DOM state
      if (
        activeContainerId &&
        overContainerId &&
        activeContainerId === overContainerId
      )
      {
        const renderedSnapshot = captureRenderedContainerSnapshot(
          preview,
          activeContainerId
        )

        if (renderedSnapshot)
        {
          updateDragPreview(renderedSnapshot)
        }
      }
    }

    commitDragPreview()
    resetDragState()
  }

  // always discard the preview & clean up on keyboard/programmatic cancel
  const onDragCancel = () =>
  {
    discardDragPreview()
    resetDragState()
  }

  return {
    sensors,
    // resolve active item object from ID for the drag overlay
    activeItem:
      showDragOverlay && activeItemId ? items[activeItemId] : undefined,
    collisionDetection,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}
