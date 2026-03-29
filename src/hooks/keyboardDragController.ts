// src/hooks/keyboardDragController.ts
// keyboard browse & drag state-machine helpers for tier items

import { useTierListStore } from '../store/useTierListStore'
import {
  findContainer,
  getEffectiveContainerSnapshot,
  getItemsInContainer,
  moveItemToIndexInSnapshot,
} from '../utils/dragSnapshot'
import {
  resolveColumnAwareCrossTierIndex,
  resolveIntraContainerRowMove,
} from '../utils/dragDomCapture'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '../utils/dragKeyboard'
import type { KeyboardDragDirection } from '../utils/dragKeyboard'
import { scheduleKeyboardFocusRestore } from './keyboardFocus'

type TierListKeyboardState = ReturnType<typeof useTierListStore.getState>

export const KEYBOARD_DIRECTIONS = new Set<KeyboardDragDirection>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
])

const handleBrowseModeArrowKey = (
  state: TierListKeyboardState,
  itemId: string,
  direction: KeyboardDragDirection
) =>
{
  const snapshot = getEffectiveContainerSnapshot(state)
  const focusedItemId = state.keyboardFocusItemId ?? itemId

  // if the focused item no longer exists (e.g. deleted via undo),
  // fall back to the current element's item & re-anchor focus
  const focusContainerId = findContainer(snapshot, focusedItemId)

  if (!focusContainerId)
  {
    state.setKeyboardFocusItemId(itemId)
    scheduleKeyboardFocusRestore(itemId)
    return
  }

  // check for intra-row navigation within a multi-row container
  if (direction === 'ArrowUp' || direction === 'ArrowDown')
  {
    const containerItems = getItemsInContainer(snapshot, focusContainerId)
    const intraMove = resolveIntraContainerRowMove(
      focusContainerId,
      focusedItemId,
      direction,
      containerItems
    )

    if (intraMove)
    {
      state.setKeyboardFocusItemId(intraMove.targetItemId)
      scheduleKeyboardFocusRestore(intraMove.targetItemId)
      return
    }
  }

  const nextFocusItemId = resolveNextKeyboardFocusItem({
    snapshot,
    itemId: focusedItemId,
    direction,
  })

  if (!nextFocusItemId)
  {
    return
  }

  // column-aware focus when crossing tiers w/ ArrowUp/ArrowDown
  const nextFocusContainer = findContainer(snapshot, nextFocusItemId)

  if (
    (direction === 'ArrowUp' || direction === 'ArrowDown') &&
    nextFocusContainer &&
    focusContainerId !== nextFocusContainer
  )
  {
    const targetItems = getItemsInContainer(snapshot, nextFocusContainer)
    const columnTarget = resolveColumnAwareCrossTierIndex(
      focusContainerId,
      focusedItemId,
      nextFocusContainer,
      targetItems,
      direction
    )

    if (columnTarget)
    {
      state.setKeyboardFocusItemId(columnTarget.targetItemId)
      scheduleKeyboardFocusRestore(columnTarget.targetItemId)
      return
    }
  }

  state.setKeyboardFocusItemId(nextFocusItemId)
  scheduleKeyboardFocusRestore(nextFocusItemId)
}

const handleDraggingModeArrowKey = (
  state: TierListKeyboardState,
  direction: KeyboardDragDirection
) =>
{
  const snapshot = getEffectiveContainerSnapshot(state)

  if (!state.activeItemId)
  {
    return
  }

  const activeKeyboardItemId = state.activeItemId
  const activeContainerId = findContainer(snapshot, activeKeyboardItemId)

  // if the dragged item no longer exists, discard the preview & exit
  if (!activeContainerId)
  {
    state.discardDragPreview()
    state.setActiveItemId(null)
    state.clearKeyboardMode()
    return
  }

  // check for intra-row movement within a multi-row container
  if (direction === 'ArrowUp' || direction === 'ArrowDown')
  {
    const containerItems = getItemsInContainer(snapshot, activeContainerId)
    const intraMove = resolveIntraContainerRowMove(
      activeContainerId,
      activeKeyboardItemId,
      direction,
      containerItems
    )

    if (intraMove)
    {
      const nextPreview = moveItemToIndexInSnapshot({
        snapshot,
        itemId: activeKeyboardItemId,
        toContainerId: activeContainerId,
        toIndex: intraMove.targetIndex,
      })
      state.updateDragPreview(nextPreview)
      state.setKeyboardFocusItemId(activeKeyboardItemId)
      scheduleKeyboardFocusRestore(activeKeyboardItemId)
      return
    }
  }

  let nextTarget = resolveNextKeyboardDragPreview({
    snapshot,
    itemId: activeKeyboardItemId,
    direction,
  })

  if (!nextTarget)
  {
    return
  }

  // column-aware placement when crossing into a multi-row target
  if (
    (direction === 'ArrowUp' || direction === 'ArrowDown') &&
    nextTarget.containerId !== activeContainerId
  )
  {
    const targetItems = getItemsInContainer(snapshot, nextTarget.containerId)
    const columnTarget = resolveColumnAwareCrossTierIndex(
      activeContainerId,
      activeKeyboardItemId,
      nextTarget.containerId,
      targetItems,
      direction
    )

    if (columnTarget)
    {
      nextTarget = {
        containerId: nextTarget.containerId,
        nextPreview: moveItemToIndexInSnapshot({
          snapshot,
          itemId: activeKeyboardItemId,
          toContainerId: nextTarget.containerId,
          toIndex: columnTarget.targetIndex,
        }),
      }
    }
  }

  state.updateDragPreview(nextTarget.nextPreview)
  state.setKeyboardFocusItemId(activeKeyboardItemId)
  scheduleKeyboardFocusRestore(activeKeyboardItemId)
}

export const handleKeyboardSpaceKey = (itemId: string) =>
{
  const state = useTierListStore.getState()
  const focusedItemId = state.keyboardFocusItemId ?? itemId

  if (state.keyboardMode === 'idle')
  {
    state.setKeyboardFocusItemId(itemId)
    state.setKeyboardMode('browse')
    return
  }

  if (state.keyboardMode === 'browse')
  {
    state.beginDragPreview()
    state.setActiveItemId(focusedItemId)
    state.setKeyboardFocusItemId(focusedItemId)
    state.setKeyboardMode('dragging')
    scheduleKeyboardFocusRestore(focusedItemId)
    return
  }

  if (
    state.keyboardMode === 'dragging' &&
    state.activeItemId &&
    state.dragPreview
  )
  {
    const droppedItemId = state.activeItemId
    state.commitDragPreview()
    state.setActiveItemId(null)
    state.setKeyboardFocusItemId(droppedItemId)
    state.setKeyboardMode('browse')
    scheduleKeyboardFocusRestore(droppedItemId)
  }
}

export const handleKeyboardArrowKey = (
  itemId: string,
  direction: KeyboardDragDirection
) =>
{
  const state = useTierListStore.getState()

  if (state.keyboardMode === 'browse')
  {
    handleBrowseModeArrowKey(state, itemId, direction)
    return
  }

  if (state.keyboardMode !== 'dragging' || !state.activeItemId)
  {
    return
  }

  handleDraggingModeArrowKey(state, direction)
}

export const handleKeyboardEscapeKey = (itemId: string) =>
{
  const state = useTierListStore.getState()
  const focusedItemId =
    state.activeItemId ?? state.keyboardFocusItemId ?? itemId

  if (state.keyboardMode === 'dragging')
  {
    state.discardDragPreview()
    state.setActiveItemId(null)
  }

  if (state.keyboardMode === 'idle')
  {
    return
  }

  state.clearKeyboardMode()
  scheduleKeyboardFocusRestore(focusedItemId)
}

export const handleKeyboardItemFocus = (itemId: string) =>
{
  const state = useTierListStore.getState()

  if (state.keyboardMode !== 'idle')
  {
    state.setKeyboardFocusItemId(itemId)
  }
}
