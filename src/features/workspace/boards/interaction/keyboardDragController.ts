// src/features/workspace/boards/interaction/keyboardDragController.ts
// keyboard browse & drag state-machine helpers for tier items

import { announce } from '~/shared/a11y/announce'
import { getContainerLabel } from '~/features/workspace/boards/lib/containerLabel'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  findContainer,
  getEffectiveContainerSnapshot,
  getItemsInContainer,
  moveItemToIndexInSnapshot,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import {
  resolveColumnAwareCrossTierIndex,
  resolveIntraContainerRowMove,
} from '~/features/workspace/boards/dnd/dragDomCapture'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '~/features/workspace/boards/dnd/dragKeyboard'
import type { KeyboardDragDirection } from '~/features/workspace/boards/dnd/dragKeyboard'
import {
  focusKeyboardBoardRegion,
  scheduleKeyboardFocusRestore,
} from './keyboardFocus'
import { logger } from '~/shared/lib/logger'

type TierListKeyboardState = ReturnType<typeof useActiveBoardStore.getState>

export const KEYBOARD_DIRECTIONS = new Set<KeyboardDragDirection>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
])

const getFirstBoardItemId = (state: TierListKeyboardState): ItemId | null =>
{
  return (
    state.tiers.find((tier) => tier.itemIds.length > 0)?.itemIds[0] ??
    state.unrankedItemIds[0] ??
    null
  )
}

const getPreferredBoardFocusItemId = (
  state: TierListKeyboardState
): ItemId | null =>
{
  const candidateIds = [
    state.keyboardFocusItemId,
    state.lastClickedItemId,
    getFirstBoardItemId(state),
  ]

  for (const candidateId of candidateIds)
  {
    if (candidateId && state.items[candidateId])
    {
      return candidateId
    }
  }

  return null
}

const setBrowseFocus = (
  state: TierListKeyboardState,
  itemId: ItemId,
  restoreFocus = false
) =>
{
  state.setKeyboardFocusItemId(itemId)
  state.setKeyboardMode('browse')

  if (restoreFocus)
  {
    scheduleKeyboardFocusRestore(itemId)
  }
}

const announceKeyboardDragMove = (
  state: TierListKeyboardState,
  itemId: ItemId,
  snapshot: ReturnType<typeof getEffectiveContainerSnapshot>
) =>
{
  const containerId = findContainer(snapshot, itemId)

  if (!containerId)
  {
    return
  }

  const containerItems = getItemsInContainer(snapshot, containerId)
  const position = containerItems.indexOf(itemId) + 1

  if (position <= 0)
  {
    return
  }

  const groupCount = state.dragGroupIds.length
  const label = state.items[itemId]?.label ?? 'item'
  const destination = getContainerLabel(containerId, state.tiers)

  announce(
    groupCount > 1
      ? `Moved ${groupCount} items to ${destination}, starting at position ${position}`
      : `Moved ${label} to ${destination}, position ${position} of ${containerItems.length}`
  )
}

const handleBrowseModeArrowKey = (
  state: TierListKeyboardState,
  itemId: ItemId,
  direction: KeyboardDragDirection
) =>
{
  // arrow navigation in browse mode supersedes pointer selection
  state.clearSelection()

  const snapshot = getEffectiveContainerSnapshot(state)
  const focusedItemId = state.keyboardFocusItemId ?? itemId

  if (!findContainer(snapshot, focusedItemId))
  {
    setBrowseFocus(state, itemId, true)
    return
  }

  const focusContainerId = findContainer(snapshot, focusedItemId)

  if (!focusContainerId)
  {
    setBrowseFocus(state, itemId, true)
    return
  }

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
      setBrowseFocus(state, intraMove.targetItemId, true)
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
      setBrowseFocus(state, columnTarget.targetItemId, true)
      return
    }
  }

  setBrowseFocus(state, nextFocusItemId, true)
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
    state.cancelKeyboardDrag()
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
      announceKeyboardDragMove(state, activeKeyboardItemId, nextPreview)
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
  announceKeyboardDragMove(state, activeKeyboardItemId, nextTarget.nextPreview)
}

const handleKeyboardPickupDropKey = (itemId: ItemId) =>
{
  const state = useActiveBoardStore.getState()
  const focusedItemId = state.keyboardFocusItemId ?? itemId

  if (
    state.keyboardMode === 'dragging' &&
    state.activeItemId &&
    state.dragPreview
  )
  {
    const droppedItemId = state.activeItemId
    const groupCount = state.dragGroupIds.length
    const label = state.items[droppedItemId]?.label ?? 'item'
    state.commitDragPreview()
    state.setActiveItemId(null)
    state.setKeyboardFocusItemId(droppedItemId)
    state.setKeyboardMode('browse')
    scheduleKeyboardFocusRestore(droppedItemId)

    const fresh = useActiveBoardStore.getState()
    const snapshot = getEffectiveContainerSnapshot(fresh)
    const containerId = findContainer(snapshot, droppedItemId)
    const dest = getContainerLabel(containerId, fresh.tiers)
    announce(
      groupCount > 1
        ? `Dropped ${groupCount} items in ${dest}`
        : `Dropped ${label} in ${dest}`
    )
    return
  }

  // keyboard pickup supersedes pointer selection
  state.clearSelection()

  setBrowseFocus(state, focusedItemId)
  state.beginDragPreview(focusedItemId)
  state.setActiveItemId(focusedItemId)
  state.setKeyboardFocusItemId(focusedItemId)
  state.setKeyboardMode('dragging')
  scheduleKeyboardFocusRestore(focusedItemId)
  const groupCount = useActiveBoardStore.getState().dragGroupIds.length
  const label = state.items[focusedItemId]?.label ?? 'item'
  announce(
    groupCount > 1
      ? `Picked up ${groupCount} items. Arrow keys to move, space or Enter to drop.`
      : `Picked up ${label}. Arrow keys to move, space or Enter to drop.`
  )
}

// safely reset keyboard drag state to idle — called when an exception leaves
// the state machine in an inconsistent position
const resetToSafeState = () =>
{
  try
  {
    useActiveBoardStore.getState().cancelKeyboardDrag()
  }
  catch
  {
    // last resort — prevent a secondary crash from propagating
  }
}

export const handleKeyboardSpaceKey = (itemId: ItemId) =>
{
  try
  {
    handleKeyboardPickupDropKey(itemId)
  }
  catch (error)
  {
    logger.error('keyboard', 'keyboard space handler failed:', error)
    resetToSafeState()
  }
}

export const handleKeyboardArrowKey = (
  itemId: ItemId,
  direction: KeyboardDragDirection
) =>
{
  try
  {
    const state = useActiveBoardStore.getState()

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
  catch (error)
  {
    logger.error('keyboard', 'keyboard arrow handler failed:', error)
    resetToSafeState()
  }
}

export const handleKeyboardEscapeKey = (itemId: ItemId) =>
{
  const state = useActiveBoardStore.getState()
  const focusedItemId =
    state.activeItemId ?? state.keyboardFocusItemId ?? itemId

  // priority 1: cancel active drag, return to browse
  if (state.keyboardMode === 'dragging')
  {
    state.cancelKeyboardDrag()
    state.setKeyboardMode('browse')
    state.setKeyboardFocusItemId(focusedItemId)
    scheduleKeyboardFocusRestore(focusedItemId)
    announce('Drag cancelled')
    return
  }

  // priority 2: clear selection, stay in browse
  if (state.keyboardMode === 'browse' && state.selection.ids.length > 0)
  {
    state.clearSelection()
    announce('Selection cleared')
    return
  }
}

export const handleKeyboardItemFocus = (itemId: ItemId) =>
{
  const state = useActiveBoardStore.getState()

  if (state.keyboardMode === 'dragging')
  {
    state.setKeyboardFocusItemId(itemId)
    return
  }

  if (state.keyboardMode === 'browse' && state.keyboardFocusItemId === itemId)
  {
    return
  }

  setBrowseFocus(state, itemId)
}

export const handleKeyboardBoardJumpKey = () =>
{
  const state = useActiveBoardStore.getState()
  const targetItemId = getPreferredBoardFocusItemId(state)

  state.clearSelection()

  if (!targetItemId)
  {
    focusKeyboardBoardRegion()
    announce('Board focused. No items to navigate.')
    return
  }

  setBrowseFocus(state, targetItemId, true)

  const label = state.items[targetItemId]?.label ?? 'item'
  announce(`Board focused on ${label}. Arrow keys move focus, space picks up.`)
}
