// src/features/workspace/boards/dnd/useDragAndDrop.ts
// * drag-&-drop hook — wires dnd-kit sensors, collision detection, & item move logic

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Modifier } from '@dnd-kit/core'
import type { Tier } from '@/features/workspace/boards/model/contract'
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { animateDropDistribute } from './dragDropAnimation'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { announce } from '@/shared/a11y/announce'
import { getContainerLabel } from '@/features/workspace/boards/lib/containerLabel'
import { resolveDragCollisions } from './dragCollision'
import { toStringId } from './dragHelpers'
import { syncDraggedItemPosition } from './dragPreviewController'
import { useDragSensors } from './dragSensors'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { TRASH_CONTAINER_ID } from '@/features/workspace/boards/lib/dndIds'
import {
  findContainer,
  getEffectiveContainerSnapshot,
} from '@/features/workspace/boards/dnd/dragSnapshot'
import { captureRenderedContainerSnapshot } from '@/features/workspace/boards/dnd/dragDomCapture'

type DragType = 'item' | 'tier'

const getDragType = (event: {
  active: { data: { current?: { type?: string } } }
}): DragType => (event.active.data.current?.type === 'tier' ? 'tier' : 'item')

// * primary drag-&-drop hook consumed by TierList
export const useDragAndDrop = () =>
{
  const items = useActiveBoardStore((state) => state.items)
  const dragPreview = useActiveBoardStore((state) => state.dragPreview)
  const activeItemId = useActiveBoardStore((state) => state.activeItemId)
  const keyboardMode = useActiveBoardStore((state) => state.keyboardMode)
  const setActiveItemId = useActiveBoardStore((state) => state.setActiveItemId)
  const clearKeyboardMode = useActiveBoardStore(
    (state) => state.clearKeyboardMode
  )
  const beginDragPreview = useActiveBoardStore(
    (state) => state.beginDragPreview
  )
  const updateDragPreview = useActiveBoardStore(
    (state) => state.updateDragPreview
  )
  const commitDragPreview = useActiveBoardStore(
    (state) => state.commitDragPreview
  )
  const discardDragPreview = useActiveBoardStore(
    (state) => state.discardDragPreview
  )
  const reorderTierByIndex = useActiveBoardStore(
    (state) => state.reorderTierByIndex
  )
  const removeItem = useActiveBoardStore((state) => state.removeItem)
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
  // active item's rect at drag start (before grid reflow); compared against
  // dnd-kit's post-reflow frozen rect to compute the layout shift delta
  const initialRectRef = useRef<{ left: number; top: number } | null>(null)
  // dnd-kit's frozen activeNodeRect (first non-null measurement, post-reflow);
  // captured on the modifier's first invocation so we match dnd-kit's own freeze
  const frozenOverlayRectRef = useRef<{ left: number; top: number } | null>(
    null
  )
  // whether this drag involves multiple items (enables overlay correction)
  const isMultiDragRef = useRef(false)

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
      const state = useActiveBoardStore.getState()

      if (state.keyboardMode === 'dragging')
      {
        state.cancelKeyboardDrag()
        return
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
    initialRectRef.current = null
    frozenOverlayRectRef.current = null
    isMultiDragRef.current = false
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
      const tier = useActiveBoardStore
        .getState()
        .tiers.find((t) => t.id === activeId)
      setActiveTierData(tier)
      setActiveItemId(activeId)
      announce(`Picked up tier ${tier?.name ?? 'tier'}`)
      return
    }

    // capture active item's pre-reflow rect from the DOM directly —
    // event.active.rect may not be populated at this point in the lifecycle
    const activeNode = document.querySelector(
      `[data-item-id="${activeId}"]`
    ) as HTMLElement | null
    if (activeNode)
    {
      const rect = activeNode.getBoundingClientRect()
      initialRectRef.current = { left: rect.left, top: rect.top }
    }
    else
    {
      initialRectRef.current = null
    }

    beginDragPreview(activeId)
    lastOverIdRef.current = activeId
    setActiveItemId(activeId)
    const state = useActiveBoardStore.getState()
    const groupCount = state.dragGroupIds.length
    isMultiDragRef.current = groupCount > 1
    const itemLabel = state.items[activeId]?.label ?? 'item'
    announce(
      groupCount > 1
        ? `Picked up ${groupCount} items`
        : `Picked up ${itemLabel}`
    )
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
          const tiers = useActiveBoardStore.getState().tiers
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

    // drop on trash — discard preview & remove all items in the drag group
    if (overId === TRASH_CONTAINER_ID && activeId)
    {
      const state = useActiveBoardStore.getState()
      const groupIds =
        state.dragGroupIds.length > 0 ? state.dragGroupIds : [activeId]
      const label = state.items[activeId]?.label ?? 'item'
      discardDragPreview()
      for (const id of groupIds) removeItem(id)
      // multi-trash is a group commit — clear selection so the bar dismisses
      if (groupIds.length > 1)
      {
        useActiveBoardStore.getState().clearSelection()
      }
      resetDragState()
      announce(
        groupIds.length > 1
          ? `${groupIds.length} items deleted`
          : `${label} deleted`
      )
      return
    }

    if (activeId && overId)
    {
      const preview = getEffectiveContainerSnapshot(
        useActiveBoardStore.getState()
      )
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

    // capture group info before commit clears it
    const stateBeforeCommit = useActiveBoardStore.getState()
    const groupIdsBeforeCommit = [...stateBeforeCommit.dragGroupIds]
    const groupCountBeforeCommit = groupIdsBeforeCommit.length

    // capture overlay position for the fan-out animation from the
    // active element's translated rect (where the overlay was rendered)
    let overlayOrigin: { x: number; y: number } | null = null
    if (groupCountBeforeCommit > 1)
    {
      const translated = event.active.rect.current.translated
      if (translated)
      {
        overlayOrigin = { x: translated.left, y: translated.top }
      }
    }

    commitDragPreview()

    if (activeId)
    {
      const state = useActiveBoardStore.getState()
      const label = state.items[activeId]?.label ?? 'item'
      const preview = getEffectiveContainerSnapshot(state)
      const containerId = findContainer(preview, activeId)
      const dest = getContainerLabel(containerId, state.tiers)
      announce(
        groupCountBeforeCommit > 1
          ? `Dropped ${groupCountBeforeCommit} items in ${dest}`
          : `Dropped ${label} in ${dest}`
      )
    }

    resetDragState()

    // trigger fan-out animation for multi-drag drops
    if (overlayOrigin && groupIdsBeforeCommit.length > 1)
    {
      animateDropDistribute(
        groupIdsBeforeCommit,
        overlayOrigin.x,
        overlayOrigin.y,
        { reducedMotion: useSettingsStore.getState().reducedMotion }
      )
    }
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

  // during multi-drag the grid reflows after secondary items are stripped,
  // shifting the active item's position; this modifier corrects the overlay
  // transform so the grab point stays under the cursor
  //
  // dnd-kit's DragOverlay renders at `initialRect + transform` where
  // initialRect is the active node's rect frozen at first measurement (post-
  // reflow) & transform is the pointer delta from the pre-reflow activation
  // point. this mismatch creates a persistent offset equal to the layout
  // shift. we correct by computing the shift delta & subtracting it.
  const overlayModifier: Modifier = useCallback(
    ({ activeNodeRect, transform }) =>
    {
      if (!isMultiDragRef.current || !initialRectRef.current)
      {
        return transform
      }

      if (!activeNodeRect) return transform

      // freeze activeNodeRect on first invocation — mirrors dnd-kit's own
      // useInitialValue(activeNodeRect) inside the DragOverlay component so
      // our shift delta stays consistent even if the node moves mid-drag
      if (!frozenOverlayRectRef.current)
      {
        frozenOverlayRectRef.current = {
          left: activeNodeRect.left,
          top: activeNodeRect.top,
        }
      }

      // frozenOverlayRect = dnd-kit's frozen initialRect (post-reflow)
      // initialRectRef = pre-reflow rect (where the item was when clicked)
      // the layout shift = frozenOverlayRect - initialRectRef
      const shiftX =
        frozenOverlayRectRef.current.left - initialRectRef.current.left
      const shiftY =
        frozenOverlayRectRef.current.top - initialRectRef.current.top

      // if no shift occurred, pass through unmodified
      if (shiftX === 0 && shiftY === 0) return transform

      // subtract the shift so the overlay stays where the cursor grabbed
      return {
        ...transform,
        x: transform.x - shiftX,
        y: transform.y - shiftY,
      }
    },
    []
  )

  const overlayModifiers = useMemo(() => [overlayModifier], [overlayModifier])

  return {
    sensors,
    // resolve active item object from ID for the drag overlay
    activeItem:
      showDragOverlay && dragTypeState === 'item' && activeItemId
        ? items[activeItemId]
        : undefined,
    activeTier,
    collisionDetection,
    overlayModifiers,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  }
}
