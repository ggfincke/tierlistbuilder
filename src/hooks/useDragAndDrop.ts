// src/hooks/useDragAndDrop.ts
// * drag-and-drop hook — wires dnd-kit sensors, collision detection, & item move logic
import { useEffect, useRef } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import { useTierListStore } from '../store/useTierListStore'
import { TRASH_CONTAINER_ID } from '../utils/constants'
import {
  captureRenderedContainerSnapshot,
  findContainer,
  getDraggedItemRect,
  getEffectiveContainerSnapshot,
  getItemsInContainer,
  resolveNextDragPreview,
} from '../utils/dragInsertion'

interface DragPositionEvent {
  active: DragMoveEvent['active']
  over: DragMoveEvent['over']
  delta: DragMoveEvent['delta']
}

// cast UniqueIdentifier to string (null if numeric ID slips through)
const toStringId = (id: UniqueIdentifier): string | null => {
  return typeof id === 'string' ? id : null
}

// * primary drag-and-drop hook consumed by TierList
export const useDragAndDrop = () => {
  const items = useTierListStore((state) => state.items)
  const dragPreview = useTierListStore((state) => state.dragPreview)
  const activeItemId = useTierListStore((state) => state.activeItemId)
  const setActiveItemId = useTierListStore((state) => state.setActiveItemId)
  const beginDragPreview = useTierListStore((state) => state.beginDragPreview)
  const updateDragPreview = useTierListStore((state) => state.updateDragPreview)
  const commitDragPreview = useTierListStore((state) => state.commitDragPreview)
  const discardDragPreview = useTierListStore((state) => state.discardDragPreview)
  const removeItem = useTierListStore((state) => state.removeItem)
  // last resolved over-ID — used as fallback when pointer leaves all droppables
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null)
  // flag set when the dragged item crosses into a new container mid-drag
  const movedToNewContainerRef = useRef(false)

  // configure sensors: pointer (5px threshold), touch (120ms delay), keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // reset the cross-container flag on the next animation frame after layout settles
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      movedToNewContainerRef.current = false
    })

    return () => cancelAnimationFrame(frame)
  }, [dragPreview])

  // stabilize hit testing when items move between containers during the drag
  const collisionDetection: CollisionDetection = (args) => {
    const activeId = toStringId(args.active.id)
    if (!activeId) {
      return []
    }

    const state = getEffectiveContainerSnapshot(useTierListStore.getState())
    const pointerIntersections = pointerWithin(args)
    // prefer pointer-within hits; fall back to rect intersection
    const intersections =
      pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args)
    let overId = getFirstCollision(intersections, 'id')

    if (overId) {
      const overIdString = toStringId(overId)

      // trash zone is a standalone droppable, not a container w/ items
      if (overIdString === TRASH_CONTAINER_ID) {
        lastOverIdRef.current = overId
        return [{ id: overId }]
      }

      const overContainerId = overIdString ? findContainer(state, overIdString) : null

      if (overIdString && overContainerId) {
        const overItems = getItemsInContainer(state, overContainerId)

        // when hovering directly over the container (not an item), use closest-center among its children
        if (overIdString === overContainerId && overItems.length > 0) {
          const itemCollisions = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((container) => {
              const containerId = toStringId(container.id)
              return containerId ? overItems.includes(containerId) : false
            }),
          })

          overId = itemCollisions[0]?.id ?? overId
        }

        lastOverIdRef.current = overId
        return [{ id: overId }]
      }
    }

    // while outside all droppables, stick to the active item if it just moved containers
    if (movedToNewContainerRef.current) {
      lastOverIdRef.current = activeId
    }

    // don't stick to the trash zone when the pointer leaves it
    if (lastOverIdRef.current && toStringId(lastOverIdRef.current) === TRASH_CONTAINER_ID) {
      lastOverIdRef.current = activeId
    }

    // fall back to last known over-ID to avoid flickering
    return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : []
  }

  // clear all drag-tracking refs & deactivate the overlay
  const resetDragState = () => {
    lastOverIdRef.current = null
    movedToNewContainerRef.current = false
    setActiveItemId(null)
  }

  // keep the preview order in sync with the live visual drag position
  const syncDraggedItemPosition = (event: DragPositionEvent): boolean => {
    if (!event.over) {
      return false
    }

    const activeId = toStringId(event.active.id)
    const overId = toStringId(event.over.id)

    // skip when IDs are missing or dnd-kit reports the dragged item itself as the current target
    if (!activeId || !overId || activeId === overId) {
      return false
    }

    // don't update the snapshot when hovering over the trash zone
    if (overId === TRASH_CONTAINER_ID) {
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

    if (nextPreview === preview) {
      return false
    }

    movedToNewContainerRef.current =
      findContainer(preview, activeId) !== findContainer(nextPreview, activeId)
    updateDragPreview(nextPreview)
    return true
  }

  // capture snapshot & mark active item when drag begins
  const onDragStart = (event: DragStartEvent) => {
    const activeId = toStringId(event.active.id)
    if (!activeId) {
      return
    }

    beginDragPreview()
    lastOverIdRef.current = activeId
    setActiveItemId(activeId)
  }

  // live-update item position as pointer moves over containers & items
  const onDragMove = (event: DragMoveEvent) => {
    syncDraggedItemPosition(event)
  }

  // respond immediately when the active item enters a different droppable target
  const onDragOver = (event: DragOverEvent) => {
    syncDraggedItemPosition(event)
  }

  // commit the exact preview that was rendered, or discard it when dropped outside
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) {
      discardDragPreview()
      resetDragState()
      return
    }

    const activeId = toStringId(event.active.id)
    const overId = toStringId(event.over.id)

    // drop on trash — discard preview & remove the item
    if (overId === TRASH_CONTAINER_ID && activeId) {
      discardDragPreview()
      removeItem(activeId)
      resetDragState()
      return
    }

    if (activeId && overId) {
      const preview = getEffectiveContainerSnapshot(useTierListStore.getState())
      const activeContainerId = findContainer(preview, activeId)
      const overContainerId = findContainer(preview, overId)

      if (
        activeContainerId &&
        overContainerId &&
        activeContainerId === overContainerId
      ) {
        const renderedSnapshot = captureRenderedContainerSnapshot(preview)

        if (renderedSnapshot) {
          updateDragPreview(renderedSnapshot)
        }
      }
    }

    commitDragPreview()
    resetDragState()
  }

  // always discard the preview & clean up on keyboard/programmatic cancel
  const onDragCancel = () => {
    discardDragPreview()
    resetDragState()
  }

  return {
    sensors,
    // resolve active item object from ID for the drag overlay
    activeItem: activeItemId ? items[activeItemId] : undefined,
    collisionDetection,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}
