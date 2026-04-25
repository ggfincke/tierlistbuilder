// src/features/workspace/boards/interaction/keyboardNavigation.ts
// pure keyboard navigation resolution for browse & drag modes

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import {
  findContainer,
  getItemsInContainer,
  moveItemToIndexInSnapshot,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
  type KeyboardDragDirection,
} from '~/features/workspace/boards/dnd/dragKeyboard'
import {
  NO_DRAG_ROW_LAYOUT_LOOKUP,
  type DragRowLayoutLookup,
} from '~/features/workspace/boards/dnd/dragLayoutSession'
import {
  resolveColumnAwareCrossContainerIndexFromLayouts,
  resolveIntraContainerRowMoveFromLayout,
} from '~/features/workspace/boards/dnd/dragLayoutRows'

interface ResolveBrowseKeyboardNavigationArgs
{
  snapshot: ContainerSnapshot
  itemId: ItemId
  focusedItemId: ItemId | null
  direction: KeyboardDragDirection
  getRowLayout?: DragRowLayoutLookup
}

interface ResolveDraggingKeyboardNavigationArgs
{
  snapshot: ContainerSnapshot
  itemId: ItemId
  direction: KeyboardDragDirection
  getRowLayout?: DragRowLayoutLookup
}

export type DraggingKeyboardNavigationResult =
  | { kind: 'missing-active' }
  | { kind: 'move'; containerId: string; nextPreview: ContainerSnapshot }
  | { kind: 'noop' }

export const resolveBrowseKeyboardNavigation = ({
  snapshot,
  itemId,
  focusedItemId,
  direction,
  getRowLayout = NO_DRAG_ROW_LAYOUT_LOOKUP,
}: ResolveBrowseKeyboardNavigationArgs): ItemId | null =>
{
  const activeFocusItemId = focusedItemId ?? itemId
  const focusContainerId = findContainer(snapshot, activeFocusItemId)

  if (!focusContainerId)
  {
    return itemId
  }

  if (direction === 'ArrowUp' || direction === 'ArrowDown')
  {
    const containerItems = getItemsInContainer(snapshot, focusContainerId)
    const intraMove = resolveIntraContainerRowMoveFromLayout(
      getRowLayout(focusContainerId),
      activeFocusItemId,
      direction,
      containerItems
    )

    if (intraMove)
    {
      return intraMove.targetItemId
    }
  }

  const nextFocusItemId = resolveNextKeyboardFocusItem({
    snapshot,
    itemId: activeFocusItemId,
    direction,
  })

  if (!nextFocusItemId)
  {
    return null
  }

  const nextFocusContainerId = findContainer(snapshot, nextFocusItemId)

  if (
    (direction === 'ArrowUp' || direction === 'ArrowDown') &&
    nextFocusContainerId &&
    focusContainerId !== nextFocusContainerId
  )
  {
    const targetItems = getItemsInContainer(snapshot, nextFocusContainerId)
    const columnTarget = resolveColumnAwareCrossContainerIndexFromLayouts(
      getRowLayout(focusContainerId),
      getRowLayout(nextFocusContainerId),
      activeFocusItemId,
      targetItems,
      direction
    )

    if (columnTarget)
    {
      return columnTarget.targetItemId
    }
  }

  return nextFocusItemId
}

export const resolveDraggingKeyboardNavigation = ({
  snapshot,
  itemId,
  direction,
  getRowLayout = NO_DRAG_ROW_LAYOUT_LOOKUP,
}: ResolveDraggingKeyboardNavigationArgs): DraggingKeyboardNavigationResult =>
{
  const activeContainerId = findContainer(snapshot, itemId)

  if (!activeContainerId)
  {
    return { kind: 'missing-active' }
  }

  if (direction === 'ArrowUp' || direction === 'ArrowDown')
  {
    const containerItems = getItemsInContainer(snapshot, activeContainerId)
    const intraMove = resolveIntraContainerRowMoveFromLayout(
      getRowLayout(activeContainerId),
      itemId,
      direction,
      containerItems
    )

    if (intraMove)
    {
      return {
        kind: 'move',
        containerId: activeContainerId,
        nextPreview: moveItemToIndexInSnapshot({
          snapshot,
          itemId,
          toContainerId: activeContainerId,
          toIndex: intraMove.targetIndex,
        }),
      }
    }
  }

  let nextTarget = resolveNextKeyboardDragPreview({
    snapshot,
    itemId,
    direction,
  })

  if (!nextTarget)
  {
    return { kind: 'noop' }
  }

  if (
    (direction === 'ArrowUp' || direction === 'ArrowDown') &&
    nextTarget.containerId !== activeContainerId
  )
  {
    const targetItems = getItemsInContainer(snapshot, nextTarget.containerId)
    const columnTarget = resolveColumnAwareCrossContainerIndexFromLayouts(
      getRowLayout(activeContainerId),
      getRowLayout(nextTarget.containerId),
      itemId,
      targetItems,
      direction
    )

    if (columnTarget)
    {
      nextTarget = {
        containerId: nextTarget.containerId,
        nextPreview: moveItemToIndexInSnapshot({
          snapshot,
          itemId,
          toContainerId: nextTarget.containerId,
          toIndex: columnTarget.targetIndex,
        }),
      }
    }
  }

  return {
    kind: 'move',
    containerId: nextTarget.containerId,
    nextPreview: nextTarget.nextPreview,
  }
}
