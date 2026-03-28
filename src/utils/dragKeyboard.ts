// src/utils/dragKeyboard.ts
// keyboard navigation logic for drag-&-drop item movement

import type { ContainerSnapshot } from '../types'
import { UNRANKED_CONTAINER_ID, clampIndex } from './constants'
import {
  findContainer,
  getItemsInContainer,
  moveItemToIndexInSnapshot,
} from './dragSnapshot'

export type KeyboardDragDirection =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'

interface ResolveNextKeyboardDragPreviewArgs
{
  snapshot: ContainerSnapshot
  itemId: string
  direction: KeyboardDragDirection
  appendToTargetEnd?: boolean
}

interface KeyboardDragTarget
{
  containerId: string
  nextPreview: ContainerSnapshot
}

const getOrderedContainerIds = (snapshot: ContainerSnapshot): string[] =>
{
  return [...snapshot.tiers.map((tier) => tier.id), UNRANKED_CONTAINER_ID]
}

const getAdjacentKeyboardContainerId = (
  snapshot: ContainerSnapshot,
  fromContainerId: string,
  direction: Extract<KeyboardDragDirection, 'ArrowUp' | 'ArrowDown'>,
  skipEmptyContainers: boolean
): string | null =>
{
  const orderedContainerIds = getOrderedContainerIds(snapshot)
  const currentContainerIndex = orderedContainerIds.indexOf(fromContainerId)

  if (currentContainerIndex < 0)
  {
    return null
  }

  const step = direction === 'ArrowUp' ? -1 : 1

  for (
    let targetContainerIndex = currentContainerIndex + step;
    targetContainerIndex >= 0 &&
    targetContainerIndex < orderedContainerIds.length;
    targetContainerIndex += step
  )
  {
    const targetContainerId = orderedContainerIds[targetContainerIndex]

    if (!skipEmptyContainers)
    {
      return targetContainerId
    }

    if (getItemsInContainer(snapshot, targetContainerId).length > 0)
    {
      return targetContainerId
    }
  }

  return null
}

export const resolveNextKeyboardDragPreview = ({
  snapshot,
  itemId,
  direction,
  appendToTargetEnd = false,
}: ResolveNextKeyboardDragPreviewArgs): KeyboardDragTarget | null =>
{
  const fromContainerId = findContainer(snapshot, itemId)

  if (!fromContainerId)
  {
    return null
  }

  const sourceItems = getItemsInContainer(snapshot, fromContainerId)
  const sourceIndex = sourceItems.indexOf(itemId)

  if (sourceIndex < 0)
  {
    return null
  }

  if (direction === 'ArrowLeft')
  {
    if (sourceIndex === 0)
    {
      return null
    }

    const targetIndex = sourceIndex - 1

    return {
      containerId: fromContainerId,
      nextPreview: moveItemToIndexInSnapshot({
        snapshot,
        itemId,
        toContainerId: fromContainerId,
        toIndex: targetIndex,
      }),
    }
  }

  if (direction === 'ArrowRight')
  {
    if (sourceIndex === sourceItems.length - 1)
    {
      return null
    }

    const targetIndex = sourceIndex + 1

    return {
      containerId: fromContainerId,
      nextPreview: moveItemToIndexInSnapshot({
        snapshot,
        itemId,
        toContainerId: fromContainerId,
        toIndex: targetIndex,
      }),
    }
  }

  const targetContainerId = getAdjacentKeyboardContainerId(
    snapshot,
    fromContainerId,
    direction,
    false
  )

  if (!targetContainerId)
  {
    return null
  }

  const targetItems = getItemsInContainer(snapshot, targetContainerId)
  const targetIndex = appendToTargetEnd
    ? targetItems.length
    : clampIndex(sourceIndex, 0, targetItems.length)

  return {
    containerId: targetContainerId,
    nextPreview: moveItemToIndexInSnapshot({
      snapshot,
      itemId,
      toContainerId: targetContainerId,
      toIndex: targetIndex,
    }),
  }
}

export const resolveNextKeyboardFocusItem = ({
  snapshot,
  itemId,
  direction,
}: ResolveNextKeyboardDragPreviewArgs): string | null =>
{
  const fromContainerId = findContainer(snapshot, itemId)

  if (!fromContainerId)
  {
    return null
  }

  const sourceItems = getItemsInContainer(snapshot, fromContainerId)
  const sourceIndex = sourceItems.indexOf(itemId)

  if (sourceIndex < 0)
  {
    return null
  }

  if (direction === 'ArrowLeft')
  {
    return sourceItems[sourceIndex - 1] ?? null
  }

  if (direction === 'ArrowRight')
  {
    return sourceItems[sourceIndex + 1] ?? null
  }

  const targetContainerId = getAdjacentKeyboardContainerId(
    snapshot,
    fromContainerId,
    direction,
    true
  )

  if (!targetContainerId)
  {
    return null
  }

  const targetItems = getItemsInContainer(snapshot, targetContainerId)
  const targetIndex = clampIndex(sourceIndex, 0, targetItems.length - 1)

  return targetItems[targetIndex] ?? null
}
