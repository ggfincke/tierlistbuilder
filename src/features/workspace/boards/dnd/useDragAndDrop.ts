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

import { animateDropDistribute } from '~/features/workspace/boards/dnd/dragDropAnimation'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { announce } from '~/shared/a11y/announce'
import { getContainerLabel } from '~/features/workspace/boards/lib/containerLabel'
import { resolveDragCollisions } from '~/features/workspace/boards/dnd/dragCollision'
import { resolveDragEndDecision } from '~/features/workspace/boards/dnd/dragEndDecision'
import {
  toItemId,
  toStringId,
} from '~/features/workspace/boards/dnd/dragHelpers'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { syncDraggedItemPosition } from '~/features/workspace/boards/dnd/dragPreviewController'
import { useDragSensors } from '~/features/workspace/boards/dnd/dragSensors'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { getItemElementById } from '~/features/workspace/boards/lib/dndIds'
import {
  findContainer,
  getEffectiveContainerSnapshot,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { captureRenderedContainerSnapshot } from '~/features/workspace/boards/dnd/dragDomCapture'
import { formatCountedWord } from '~/shared/lib/pluralize'

type DragType = 'item' | 'tier'

interface TierDragRect
{
  width: number
  height: number
}

type ActivePointerDrag =
  | { kind: 'idle' }
  | { kind: 'item'; itemId: ItemId }
  | {
      kind: 'tier'
      tierId: string
      tier: Tier | undefined
      rect: TierDragRect | null
    }

const IDLE_POINTER_DRAG: ActivePointerDrag = { kind: 'idle' }

const getDragType = (event: {
  active: { data: { current?: { type?: string } } }
}): DragType => (event.active.data.current?.type === 'tier' ? 'tier' : 'item')

export const useDragAndDrop = () =>
{
  const {
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
  const movedResetFrameRef = useRef<number | null>(null)
  const initialRectRef = useRef<{ left: number; top: number } | null>(null)
  const frozenOverlayRectRef = useRef<{ left: number; top: number } | null>(
    null
  )
  const isMultiDragRef = useRef(false)
  const currentPreviewRef = useRef<ContainerSnapshot | null>(null)
  const pendingPreviewRef = useRef<ContainerSnapshot | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const currentTierIdsRef = useRef<ReadonlySet<string>>(new Set())

  const sensors = useDragSensors()

  const setActiveDrag = (drag: ActivePointerDrag) =>
  {
    activeDragRef.current = drag
    setActiveDragState(drag)
  }

  // drain the rAF-batched preview snapshot & cancel any pending frame;
  // return the latest payload or null when nothing is queued
  const consumePendingPreview = (): ContainerSnapshot | null =>
  {
    const pending = pendingPreviewRef.current
    pendingPreviewRef.current = null
    if (previewFrameRef.current !== null)
    {
      cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }
    return pending
  }

  const cancelMovedReset = () =>
  {
    if (movedResetFrameRef.current === null) return
    cancelAnimationFrame(movedResetFrameRef.current)
    movedResetFrameRef.current = null
  }

  const scheduleMovedReset = () =>
  {
    if (!movedToNewContainerRef.current)
    {
      return
    }

    cancelMovedReset()
    movedResetFrameRef.current = requestAnimationFrame(() =>
    {
      movedToNewContainerRef.current = false
      movedResetFrameRef.current = null
    })
  }

  const flushPendingPreviewUpdate = () =>
  {
    const pending = consumePendingPreview()
    if (!pending) return

    currentPreviewRef.current = pending
    updateDragPreview(pending)
    scheduleMovedReset()
  }

  const getCurrentDragPreview = (): ContainerSnapshot =>
    pendingPreviewRef.current ??
    currentPreviewRef.current ??
    getEffectiveContainerSnapshot(useActiveBoardStore.getState())

  const getCurrentTierIds = (): ReadonlySet<string> => currentTierIdsRef.current

  const schedulePreviewUpdate = (preview: ContainerSnapshot) =>
  {
    currentPreviewRef.current = preview
    pendingPreviewRef.current = preview
    if (previewFrameRef.current !== null) return

    previewFrameRef.current = requestAnimationFrame(() =>
    {
      const pending = consumePendingPreview()
      if (!pending) return

      currentPreviewRef.current = pending
      updateDragPreview(pending)
      scheduleMovedReset()
    })
  }

  useEffect(
    () => () =>
    {
      consumePendingPreview()
      cancelMovedReset()
    },
    []
  )

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
      resolveDragCollisions(
        args,
        lastOverIdRef,
        movedToNewContainerRef,
        getCurrentDragPreview,
        getCurrentTierIds
      ),
    []
  )

  const resetDragState = () =>
  {
    consumePendingPreview()
    cancelMovedReset()
    lastOverIdRef.current = null
    movedToNewContainerRef.current = false
    initialRectRef.current = null
    frozenOverlayRectRef.current = null
    isMultiDragRef.current = false
    currentPreviewRef.current = null
    currentTierIdsRef.current = new Set()
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
      const state = useActiveBoardStore.getState()
      currentTierIdsRef.current = new Set(
        state.tiers.map((entry) => String(entry.id))
      )
      const tier = state.tiers.find((entry) => entry.id === activeStringId)
      const initialRect = event.active.rect.current.initial
      const rect = initialRect
        ? { width: initialRect.width, height: initialRect.height }
        : null
      setActiveDrag({ kind: 'tier', tierId: activeStringId, tier, rect })
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
    currentPreviewRef.current = getEffectiveContainerSnapshot(
      useActiveBoardStore.getState()
    )
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

  const syncItemDrag = (event: DragMoveEvent | DragOverEvent) =>
  {
    if (activeDragRef.current.kind !== 'item') return
    syncDraggedItemPosition(
      event,
      getCurrentDragPreview(),
      movedToNewContainerRef,
      schedulePreviewUpdate
    )
  }

  const onDragEnd = (event: DragEndEvent) =>
  {
    flushPendingPreviewUpdate()
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
        { reducedMotion: usePreferencesStore.getState().reducedMotion }
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
  const activeItemId = activeDrag.kind === 'item' ? activeDrag.itemId : null
  const activeTier = activeDrag.kind === 'tier' ? activeDrag.tier : undefined
  const activeTierRect = activeDrag.kind === 'tier' ? activeDrag.rect : null

  return {
    sensors,
    activeItemId,
    activeTier,
    activeTierRect,
    collisionDetection,
    overlayModifiers,
    onDragStart,
    onDragMove: syncItemDrag,
    onDragOver: syncItemDrag,
    onDragEnd,
    onDragCancel,
  }
}
