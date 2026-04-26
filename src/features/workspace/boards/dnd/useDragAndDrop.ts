// src/features/workspace/boards/dnd/useDragAndDrop.ts
// * drag-&-drop hook — wires dnd-kit sensors, collision detection, & item move logic

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Modifier } from '@dnd-kit/core'
import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { animateDropDistribute } from './dragDropAnimation'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { announce } from '~/shared/a11y/announce'
import { getContainerLabel } from '~/features/workspace/boards/lib/containerLabel'
import { resolveDragCollisions } from './dragCollision'
import { resolveDragEndDecision } from './dragEndDecision'
import { toItemId, toStringId } from './dragHelpers'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { syncDraggedItemPosition } from './dragPreviewController'
import { useDragSensors } from './dragSensors'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { getItemElementById } from '~/features/workspace/boards/lib/dndIds'
import {
  findContainer,
  getEffectiveContainerSnapshot,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import { captureRenderedContainerSnapshot } from '~/features/workspace/boards/dnd/dragDomCapture'
import { formatCountedWord } from '~/shared/lib/pluralize'

type DragType = 'item' | 'tier'

type ActivePointerDrag =
  | { kind: 'idle' }
  | { kind: 'item'; itemId: ItemId }
  | { kind: 'tier'; tierId: string; tier: Tier | undefined }

const IDLE_POINTER_DRAG: ActivePointerDrag = { kind: 'idle' }

const getDragType = (event: {
  active: { data: { current?: { type?: string } } }
}): DragType => (event.active.data.current?.type === 'tier' ? 'tier' : 'item')

export const useDragAndDrop = () =>
{
  const {
    items,
    dragPreview,
    keyboardMode,
    setActiveItemId,
    clearKeyboardMode,
    beginDragPreview,
    updateDragPreview,
    commitDragPreview,
    discardDragPreview,
    reorderTierByIndex,
    removeItems,
  } = useActiveBoardStore(
    useShallow((state) => ({
      items: state.items,
      dragPreview: state.dragPreview,
      keyboardMode: state.keyboardMode,
      setActiveItemId: state.setActiveItemId,
      clearKeyboardMode: state.clearKeyboardMode,
      beginDragPreview: state.beginDragPreview,
      updateDragPreview: state.updateDragPreview,
      commitDragPreview: state.commitDragPreview,
      discardDragPreview: state.discardDragPreview,
      reorderTierByIndex: state.reorderTierByIndex,
      removeItems: state.removeItems,
    }))
  )
  const activeDragRef = useRef<ActivePointerDrag>(IDLE_POINTER_DRAG)
  const [activeDrag, setActiveDragState] =
    useState<ActivePointerDrag>(IDLE_POINTER_DRAG)
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null)
  const movedToNewContainerRef = useRef(false)
  const initialRectRef = useRef<{ left: number; top: number } | null>(null)
  const frozenOverlayRectRef = useRef<{ left: number; top: number } | null>(
    null
  )
  const isMultiDragRef = useRef(false)

  const sensors = useDragSensors()

  const setActiveDrag = (drag: ActivePointerDrag) =>
  {
    activeDragRef.current = drag
    setActiveDragState(drag)
  }

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

  const resetDragState = () =>
  {
    lastOverIdRef.current = null
    movedToNewContainerRef.current = false
    initialRectRef.current = null
    frozenOverlayRectRef.current = null
    isMultiDragRef.current = false
    setActiveDrag(IDLE_POINTER_DRAG)
    setActiveItemId(null)
  }

  const onDragStart = (event: DragStartEvent) =>
  {
    const activeStringId = toStringId(event.active.id)
    if (!activeStringId)
    {
      return
    }

    const type = getDragType(event)
    clearKeyboardMode()

    if (type === 'tier')
    {
      const tier = useActiveBoardStore
        .getState()
        .tiers.find((entry) => entry.id === activeStringId)
      setActiveDrag({ kind: 'tier', tierId: activeStringId, tier })
      announce(`Picked up tier ${tier?.name ?? 'tier'}`)
      return
    }

    const activeId = toItemId(event.active.id)
    if (!activeId)
    {
      return
    }

    const activeNode = getItemElementById(activeId)
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
    setActiveDrag({ kind: 'item', itemId: activeId })

    const state = useActiveBoardStore.getState()
    const groupCount = state.dragGroupIds.length
    isMultiDragRef.current = groupCount > 1
    const itemLabel = state.items[activeId]?.label ?? 'item'
    announce(
      groupCount > 1
        ? `Picked up ${formatCountedWord(groupCount, 'item')}`
        : `Picked up ${itemLabel}`
    )
  }

  const onDragMove = (event: DragMoveEvent) =>
  {
    if (activeDragRef.current.kind !== 'item') return
    syncDraggedItemPosition(event, movedToNewContainerRef, updateDragPreview)
  }

  const onDragOver = (event: DragOverEvent) =>
  {
    if (activeDragRef.current.kind !== 'item') return
    syncDraggedItemPosition(event, movedToNewContainerRef, updateDragPreview)
  }

  const onDragEnd = (event: DragEndEvent) =>
  {
    const activeStringId = toStringId(event.active.id)
    const activeFallbackId = activeStringId ? toItemId(activeStringId) : null
    const activeDragState = activeDragRef.current
    const stateAtEnd = useActiveBoardStore.getState()
    const preview = getEffectiveContainerSnapshot(stateAtEnd)
    const overId = event.over ? toStringId(event.over.id) : null
    const decision = resolveDragEndDecision({
      activeDrag: activeDragState,
      activeFallbackId,
      hasOver: event.over != null,
      overId,
      snapshot: preview,
      tierIds: stateAtEnd.tiers.map((tier) => tier.id),
    })

    if (decision.kind === 'tier-reorder')
    {
      reorderTierByIndex(decision.fromIndex, decision.toIndex)
      resetDragState()
      return
    }

    if (decision.kind === 'reset')
    {
      resetDragState()
      return
    }

    if (decision.kind === 'item-cancel')
    {
      discardDragPreview()
      resetDragState()
      return
    }

    if (decision.kind === 'item-trash')
    {
      const state = useActiveBoardStore.getState()
      const groupIds =
        state.dragGroupIds.length > 0
          ? [...state.dragGroupIds]
          : [decision.itemId]
      const label = state.items[decision.itemId]?.label ?? 'item'
      discardDragPreview()
      removeItems(groupIds)
      resetDragState()
      announce(
        groupIds.length > 1
          ? `${formatCountedWord(groupIds.length, 'item')} deleted`
          : `${label} deleted`
      )
      return
    }

    if (decision.resyncContainerId)
    {
      const latestPreview = getEffectiveContainerSnapshot(
        useActiveBoardStore.getState()
      )
      const renderedSnapshot = captureRenderedContainerSnapshot(
        latestPreview,
        decision.resyncContainerId
      )

      if (renderedSnapshot)
      {
        updateDragPreview(renderedSnapshot)
      }
    }

    const stateBeforeCommit = useActiveBoardStore.getState()
    const groupIdsBeforeCommit = [...stateBeforeCommit.dragGroupIds]
    const groupCountBeforeCommit = groupIdsBeforeCommit.length

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

    const state = useActiveBoardStore.getState()
    const label = state.items[decision.itemId]?.label ?? 'item'
    const committedPreview = getEffectiveContainerSnapshot(state)
    const containerId = findContainer(committedPreview, decision.itemId)
    const dest = getContainerLabel(containerId, state.tiers)
    announce(
      groupCountBeforeCommit > 1
        ? `Dropped ${formatCountedWord(groupCountBeforeCommit, 'item')} in ${dest}`
        : `Dropped ${label} in ${dest}`
    )

    resetDragState()

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

  const onDragCancel = () =>
  {
    if (activeDragRef.current.kind === 'item')
    {
      discardDragPreview()
    }
    resetDragState()
    announce('Drag cancelled')
  }

  const overlayModifier: Modifier = useCallback(
    ({ activeNodeRect, transform }) =>
    {
      if (!isMultiDragRef.current || !initialRectRef.current)
      {
        return transform
      }

      if (!activeNodeRect) return transform

      if (!frozenOverlayRectRef.current)
      {
        frozenOverlayRectRef.current = {
          left: activeNodeRect.left,
          top: activeNodeRect.top,
        }
      }

      const shiftX =
        frozenOverlayRectRef.current.left - initialRectRef.current.left
      const shiftY =
        frozenOverlayRectRef.current.top - initialRectRef.current.top

      if (shiftX === 0 && shiftY === 0) return transform

      return {
        ...transform,
        x: transform.x - shiftX,
        y: transform.y - shiftY,
      }
    },
    []
  )

  const overlayModifiers = useMemo(() => [overlayModifier], [overlayModifier])
  const activeItem =
    activeDrag.kind === 'item' ? items[activeDrag.itemId] : undefined
  const activeTier = activeDrag.kind === 'tier' ? activeDrag.tier : undefined

  return {
    sensors,
    activeItem,
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
