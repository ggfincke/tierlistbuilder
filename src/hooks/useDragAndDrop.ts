// src/hooks/useDragAndDrop.ts
// * drag-&-drop hook — wires dnd-kit sensors, collision detection, & item move logic

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tier } from '../types'
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { announce, getContainerLabel } from '../utils/announce'
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

type DragType = 'item' | 'tier'

const toStringId = (id: UniqueIdentifier): string | null =>
{
  return typeof id === 'string' ? id : null
}

const getDragType = (event: {
  active: { data: { current?: { type?: string } } }
}): DragType => (event.active.data.current?.type === 'tier' ? 'tier' : 'item')

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
  const reorderTierByIndex = useTierListStore(
    (state) => state.reorderTierByIndex
  )
  const removeItem = useTierListStore((state) => state.removeItem)
  const [showDragOverlay, setShowDragOverlay] = useState(false)
  // tracks what kind of drag is active (ref for event handlers, state for render)
  const dragTypeRef = useRef<DragType>('item')
  const [dragTypeState, setDragTypeState] = useState<DragType>('item')
  const [activeTierData, setActiveTierData] = useState<Tier | undefined>(
    undefined
  )
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
    dragTypeRef.current = 'item'
    setDragTypeState('item')
    setActiveTierData(undefined)
    setShowDragOverlay(false)
    setActiveItemId(null)
  }

  // capture snapshot & mark active item/tier when drag begins
  const onDragStart = (event: DragStartEvent) =>
  {
    const activeId = toStringId(event.active.id)
    if (!activeId)
    {
      return
    }

    const type = getDragType(event)
    dragTypeRef.current = type
    setDragTypeState(type)
    clearKeyboardMode()
    setShowDragOverlay(true)

    if (type === 'tier')
    {
      // tier drag — no snapshot preview needed, dnd-kit handles visual reorder
      const tier = useTierListStore.getState().tiers.find((t) => t.id === activeId)
      setActiveTierData(tier)
      setActiveItemId(activeId)
      announce(`Picked up tier ${tier?.name ?? 'tier'}`)
      return
    }

    beginDragPreview()
    lastOverIdRef.current = activeId
    setActiveItemId(activeId)
    const itemLabel = useTierListStore.getState().items[activeId]?.label ?? 'item'
    announce(`Picked up ${itemLabel}`)
  }

  // live-update item position as pointer moves over containers & items
  const onDragMove = (event: DragMoveEvent) =>
  {
    if (dragTypeRef.current === 'tier') return
    syncDraggedItemPosition(event, movedToNewContainerRef, updateDragPreview)
  }

  // respond immediately when the active item enters a different droppable target
  const onDragOver = (event: DragOverEvent) =>
  {
    if (dragTypeRef.current === 'tier') return
    syncDraggedItemPosition(event, movedToNewContainerRef, updateDragPreview)
  }

  // commit the exact preview that was rendered, or discard it when dropped outside
  const onDragEnd = (event: DragEndEvent) =>
  {
    const activeId = toStringId(event.active.id)

    // tier drag — compute index swap from the sortable over target
    if (dragTypeRef.current === 'tier')
    {
      if (activeId && event.over)
      {
        const overId = toStringId(event.over.id)
        if (overId && activeId !== overId)
        {
          const tiers = useTierListStore.getState().tiers
          const fromIndex = tiers.findIndex((t) => t.id === activeId)
          const toIndex = tiers.findIndex((t) => t.id === overId)
          if (fromIndex >= 0 && toIndex >= 0)
          {
            reorderTierByIndex(fromIndex, toIndex)
          }
        }
      }
      resetDragState()
      return
    }

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
      const label = useTierListStore.getState().items[activeId]?.label ?? 'item'
      discardDragPreview()
      removeItem(activeId)
      resetDragState()
      announce(`${label} deleted`)
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

    if (activeId)
    {
      const state = useTierListStore.getState()
      const label = state.items[activeId]?.label ?? 'item'
      const preview = getEffectiveContainerSnapshot(state)
      const containerId = findContainer(preview, activeId)
      announce(`Dropped ${label} in ${getContainerLabel(containerId, state.tiers)}`)
    }

    resetDragState()
  }

  // always discard the preview & clean up on keyboard/programmatic cancel
  const onDragCancel = () =>
  {
    if (dragTypeRef.current !== 'tier')
    {
      discardDragPreview()
    }
    resetDragState()
    announce('Drag cancelled')
  }

  // resolve active tier for the drag overlay when dragging a tier row
  const activeTier =
    showDragOverlay && dragTypeState === 'tier' ? activeTierData : undefined

  return {
    sensors,
    // resolve active item object from ID for the drag overlay
    activeItem:
      showDragOverlay && dragTypeState === 'item' && activeItemId
        ? items[activeItemId]
        : undefined,
    activeTier,
    collisionDetection,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}
