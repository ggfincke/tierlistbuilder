// src/utils/dragInsertion.ts
// pure functions for drag-&-drop insertion logic

import type { ClientRect, Translate } from '@dnd-kit/core'
import type { Coordinates } from '@dnd-kit/utilities'

import type { ContainerSnapshot, Tier, TierListData } from '../types'
import { UNRANKED_CONTAINER_ID, clampIndex } from './constants'

interface GetDraggedItemRectArgs
{
  translatedRect: ClientRect | null
  initialRect: ClientRect | null
  delta: Translate
}

interface ResolveDragTargetIndexArgs
{
  draggedRect: ClientRect | null
  overRect: ClientRect
  overId: string
  overContainerId: string
  overIndex: number
  overItemsLength: number
}

interface ResolveStoreInsertionIndexArgs
{
  sameContainer: boolean
  sourceIndex: number
  targetIndex: number
  targetItemsLength: number
}

interface ResolveNextDragPreviewArgs
{
  snapshot: ContainerSnapshot
  itemId: string
  overId: string
  draggedRect: ClientRect | null
  overRect: ClientRect
}

interface MoveItemToIndexInSnapshotArgs
{
  snapshot: ContainerSnapshot
  itemId: string
  toContainerId: string
  toIndex: number
}

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

interface RenderedItemPosition
{
  itemId: string
  left: number
  top: number
}

interface IsPointerInTrailingLastRowSpaceArgs
{
  pointerCoordinates: Coordinates | null
  itemRects: ClientRect[]
}

type ContainerState = Pick<TierListData, 'tiers' | 'unrankedItemIds'>
export type KeyboardDragDirection =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'

const RENDERED_ROW_TOP_TOLERANCE_PX = 4

const sortByRenderedPosition = <T extends Pick<ClientRect, 'left' | 'top'>>(
  itemRects: T[]
): T[] =>
{
  return [...itemRects].sort((left, right) =>
  {
    const topDelta = left.top - right.top
    if (Math.abs(topDelta) > RENDERED_ROW_TOP_TOLERANCE_PX)
    {
      return topDelta
    }

    return left.left - right.left
  })
}

const hasContainer = (
  snapshot: ContainerSnapshot,
  containerId: string
): boolean =>
{
  return (
    containerId === UNRANKED_CONTAINER_ID ||
    snapshot.tiers.some((tier) => tier.id === containerId)
  )
}

const withContainerItems = (
  snapshot: ContainerSnapshot,
  containerId: string,
  nextItemIds: string[]
): ContainerSnapshot =>
{
  if (containerId === UNRANKED_CONTAINER_ID)
  {
    return {
      ...snapshot,
      unrankedItemIds: [...nextItemIds],
    }
  }

  return {
    ...snapshot,
    tiers: snapshot.tiers.map((tier) =>
      tier.id === containerId ? { ...tier, itemIds: [...nextItemIds] } : tier
    ),
  }
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

export const createContainerSnapshot = (
  state: ContainerState
): ContainerSnapshot => ({
  tiers: state.tiers.map((tier) => ({
    id: tier.id,
    itemIds: [...tier.itemIds],
  })),
  unrankedItemIds: [...state.unrankedItemIds],
})

export const getEffectiveContainerSnapshot = (
  state: ContainerState & { dragPreview: ContainerSnapshot | null }
): ContainerSnapshot =>
{
  return state.dragPreview ?? createContainerSnapshot(state)
}

export const getEffectiveTiers = (
  tiers: Tier[],
  dragPreview: ContainerSnapshot | null
): Tier[] =>
{
  if (!dragPreview)
  {
    return tiers
  }

  const itemIdsByTierId = new Map(
    dragPreview.tiers.map((tier) => [tier.id, tier.itemIds] as const)
  )

  return tiers.map((tier) => ({
    ...tier,
    itemIds: [...(itemIdsByTierId.get(tier.id) ?? tier.itemIds)],
  }))
}

export const getEffectiveUnrankedItemIds = (
  unrankedItemIds: string[],
  dragPreview: ContainerSnapshot | null
): string[] =>
{
  return dragPreview ? [...dragPreview.unrankedItemIds] : unrankedItemIds
}

export const applyContainerSnapshotToTiers = (
  tiers: Tier[],
  snapshot: ContainerSnapshot
): Tier[] =>
{
  const itemIdsByTierId = new Map(
    snapshot.tiers.map((tier) => [tier.id, tier.itemIds] as const)
  )

  return tiers.map((tier) => ({
    ...tier,
    itemIds: [...(itemIdsByTierId.get(tier.id) ?? tier.itemIds)],
  }))
}

export const findContainer = (
  snapshot: ContainerSnapshot,
  id: string
): string | null =>
{
  if (id === UNRANKED_CONTAINER_ID)
  {
    return UNRANKED_CONTAINER_ID
  }

  if (snapshot.tiers.some((tier) => tier.id === id))
  {
    return id
  }

  if (snapshot.unrankedItemIds.includes(id))
  {
    return UNRANKED_CONTAINER_ID
  }

  const parentTier = snapshot.tiers.find((tier) => tier.itemIds.includes(id))
  return parentTier?.id ?? null
}

export const getItemsInContainer = (
  snapshot: ContainerSnapshot,
  containerId: string
): string[] =>
{
  if (containerId === UNRANKED_CONTAINER_ID)
  {
    return snapshot.unrankedItemIds
  }

  return snapshot.tiers.find((tier) => tier.id === containerId)?.itemIds ?? []
}

export const getDraggedItemRect = ({
  translatedRect,
  initialRect,
  delta,
}: GetDraggedItemRectArgs): ClientRect | null =>
{
  if (translatedRect)
  {
    return translatedRect
  }

  if (!initialRect)
  {
    return null
  }

  return {
    ...initialRect,
    top: initialRect.top + delta.y,
    bottom: initialRect.bottom + delta.y,
    left: initialRect.left + delta.x,
    right: initialRect.right + delta.x,
  }
}

export const isPointerInTrailingLastRowSpace = ({
  pointerCoordinates,
  itemRects,
}: IsPointerInTrailingLastRowSpaceArgs): boolean =>
{
  if (!pointerCoordinates || itemRects.length === 0)
  {
    return false
  }

  const sortedItemRects = sortByRenderedPosition(itemRects)
  const lastRowTop = sortedItemRects[sortedItemRects.length - 1].top
  const lastRowRects = sortedItemRects.filter(
    (rect) => Math.abs(rect.top - lastRowTop) <= RENDERED_ROW_TOP_TOLERANCE_PX
  )

  const rightmostRect = lastRowRects.reduce((current, rect) =>
    rect.right > current.right ? rect : current
  )
  const rowTop = Math.min(...lastRowRects.map((rect) => rect.top))
  const rowBottom = Math.max(...lastRowRects.map((rect) => rect.bottom))

  return (
    pointerCoordinates.y >= rowTop &&
    pointerCoordinates.y <= rowBottom &&
    pointerCoordinates.x >= rightmostRect.right
  )
}

// preserve the normal between-item threshold while honoring explicit front/back drops

export const resolveDragTargetIndex = ({
  draggedRect,
  overRect,
  overId,
  overContainerId,
  overIndex,
  overItemsLength,
}: ResolveDragTargetIndexArgs): number =>
{
  if (overId === overContainerId)
  {
    return overItemsLength
  }

  if (draggedRect && overIndex === 0 && draggedRect.left < overRect.left)
  {
    return 0
  }

  if (
    draggedRect &&
    overIndex === overItemsLength - 1 &&
    draggedRect.right > overRect.right
  )
  {
    return overItemsLength
  }

  const draggedMidX = draggedRect
    ? draggedRect.left + draggedRect.width / 2
    : overRect.left + overRect.width / 2
  const overMidX = overRect.left + overRect.width / 2

  return draggedMidX > overMidX ? overIndex + 1 : overIndex
}

// convert a pre-removal target index into the actual splice position used by the store
export const resolveStoreInsertionIndex = ({
  sameContainer,
  sourceIndex,
  targetIndex,
  targetItemsLength,
}: ResolveStoreInsertionIndexArgs): number =>
{
  const normalizedTargetIndex =
    sameContainer && targetIndex > sourceIndex ? targetIndex - 1 : targetIndex

  return clampIndex(normalizedTargetIndex, 0, targetItemsLength)
}

export const moveItemInSnapshot = (
  snapshot: ContainerSnapshot,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number
): ContainerSnapshot =>
{
  if (
    !hasContainer(snapshot, fromContainerId) ||
    !hasContainer(snapshot, toContainerId)
  )
  {
    return snapshot
  }

  const sourceItems = [...getItemsInContainer(snapshot, fromContainerId)]
  const sourceIndex = sourceItems.indexOf(itemId)
  if (sourceIndex < 0)
  {
    return snapshot
  }

  sourceItems.splice(sourceIndex, 1)
  const sourcePatchedSnapshot = withContainerItems(
    snapshot,
    fromContainerId,
    sourceItems
  )

  const targetItems =
    fromContainerId === toContainerId
      ? sourceItems
      : [...getItemsInContainer(sourcePatchedSnapshot, toContainerId)]

  const insertionIndex = resolveStoreInsertionIndex({
    sameContainer: fromContainerId === toContainerId,
    sourceIndex,
    targetIndex: toIndex,
    targetItemsLength: targetItems.length,
  })

  if (fromContainerId === toContainerId && insertionIndex === sourceIndex)
  {
    return snapshot
  }

  targetItems.splice(insertionIndex, 0, itemId)

  return withContainerItems(sourcePatchedSnapshot, toContainerId, targetItems)
}

export const moveItemToIndexInSnapshot = ({
  snapshot,
  itemId,
  toContainerId,
  toIndex,
}: MoveItemToIndexInSnapshotArgs): ContainerSnapshot =>
{
  const fromContainerId = findContainer(snapshot, itemId)

  if (
    !fromContainerId ||
    !hasContainer(snapshot, fromContainerId) ||
    !hasContainer(snapshot, toContainerId)
  )
  {
    return snapshot
  }

  const sourceItems = [...getItemsInContainer(snapshot, fromContainerId)]
  const sourceIndex = sourceItems.indexOf(itemId)

  if (sourceIndex < 0)
  {
    return snapshot
  }

  sourceItems.splice(sourceIndex, 1)
  const sourcePatchedSnapshot = withContainerItems(
    snapshot,
    fromContainerId,
    sourceItems
  )
  const targetItems =
    fromContainerId === toContainerId
      ? sourceItems
      : [...getItemsInContainer(sourcePatchedSnapshot, toContainerId)]
  const insertionIndex = clampIndex(toIndex, 0, targetItems.length)

  if (fromContainerId === toContainerId && insertionIndex === sourceIndex)
  {
    return snapshot
  }

  targetItems.splice(insertionIndex, 0, itemId)

  return withContainerItems(sourcePatchedSnapshot, toContainerId, targetItems)
}

export const resolveNextDragPreview = ({
  snapshot,
  itemId,
  overId,
  draggedRect,
  overRect,
}: ResolveNextDragPreviewArgs): ContainerSnapshot =>
{
  const fromContainerId = findContainer(snapshot, itemId)
  const toContainerId = findContainer(snapshot, overId)

  if (!fromContainerId || !toContainerId)
  {
    return snapshot
  }

  const sourceItems = getItemsInContainer(snapshot, fromContainerId)
  const targetItems = getItemsInContainer(snapshot, toContainerId)
  const sourceIndex = sourceItems.indexOf(itemId)
  const overIndex = targetItems.indexOf(overId)
  const targetIndex = resolveDragTargetIndex({
    draggedRect,
    overRect,
    overId,
    overContainerId: toContainerId,
    overIndex,
    overItemsLength: targetItems.length,
  })

  if (sourceIndex < 0 || targetIndex < 0)
  {
    return snapshot
  }

  if (
    fromContainerId === toContainerId &&
    (sourceIndex === targetIndex || sourceIndex === targetIndex - 1)
  )
  {
    return snapshot
  }

  return moveItemInSnapshot(
    snapshot,
    itemId,
    fromContainerId,
    toContainerId,
    targetIndex
  )
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

// read positioned item data from a container's rendered DOM children
const getPositionedItemsFromElement = (
  containerElement: Element | null
): RenderedItemPosition[] | null =>
{
  if (!containerElement)
  {
    return null
  }

  const positionedItems = Array.from(
    containerElement.querySelectorAll<HTMLElement>('[data-item-id]')
  ).flatMap((element) =>
  {
    const itemId = element.dataset.itemId
    if (!itemId)
    {
      return []
    }

    const rect = element.getBoundingClientRect()

    return [
      {
        itemId,
        left: rect.left,
        top: rect.top,
      } satisfies RenderedItemPosition,
    ]
  })

  if (positionedItems.length === 0)
  {
    return null
  }

  return sortByRenderedPosition(positionedItems)
}

const getRenderedItemIds = (
  containerElement: Element | null,
  fallbackItemIds: string[]
): string[] =>
{
  const positioned = getPositionedItemsFromElement(containerElement)
  return positioned
    ? positioned.map((item) => item.itemId)
    : [...fallbackItemIds]
}

export const captureRenderedContainerSnapshot = (
  snapshot: ContainerSnapshot
): ContainerSnapshot | null =>
{
  if (typeof document === 'undefined')
  {
    return null
  }

  return {
    tiers: snapshot.tiers.map((tier) => ({
      id: tier.id,
      itemIds: getRenderedItemIds(
        document.querySelector(`[data-testid="tier-container-${tier.id}"]`),
        tier.itemIds
      ),
    })),
    unrankedItemIds: getRenderedItemIds(
      document.querySelector('[data-testid="unranked-container"]'),
      snapshot.unrankedItemIds
    ),
  }
}

interface RenderedRowLayout
{
  rows: string[][]
  rowCount: number
}

// get item IDs grouped by visual row for a rendered container
const getRenderedContainerRowLayout = (
  containerId: string
): RenderedRowLayout | null =>
{
  if (typeof document === 'undefined')
  {
    return null
  }

  const selector =
    containerId === UNRANKED_CONTAINER_ID
      ? '[data-testid="unranked-container"]'
      : `[data-testid="tier-container-${containerId}"]`
  const sortedItems = getPositionedItemsFromElement(
    document.querySelector(selector)
  )

  if (!sortedItems)
  {
    return null
  }

  const rows: string[][] = []
  const rowTops: number[] = []

  for (const item of sortedItems)
  {
    const existingRowIndex = rowTops.findIndex(
      (rowTop) => Math.abs(rowTop - item.top) <= RENDERED_ROW_TOP_TOLERANCE_PX
    )

    if (existingRowIndex >= 0)
    {
      rows[existingRowIndex].push(item.itemId)
    }
    else
    {
      rowTops.push(item.top)
      rows.push([item.itemId])
    }
  }

  return { rows, rowCount: rows.length }
}

export interface IntraRowMoveResult
{
  targetIndex: number
  targetItemId: string
}

// resolve an intra-container row move for ArrowUp/ArrowDown in multi-row containers
export const resolveIntraContainerRowMove = (
  containerId: string,
  itemId: string,
  direction: 'ArrowUp' | 'ArrowDown',
  containerItemIds: string[]
): IntraRowMoveResult | null =>
{
  const layout = getRenderedContainerRowLayout(containerId)

  if (!layout || layout.rowCount <= 1)
  {
    return null
  }

  const currentRowIndex = layout.rows.findIndex((row) => row.includes(itemId))

  if (currentRowIndex < 0)
  {
    return null
  }

  const targetRowIndex =
    direction === 'ArrowDown' ? currentRowIndex + 1 : currentRowIndex - 1

  if (targetRowIndex < 0 || targetRowIndex >= layout.rowCount)
  {
    return null
  }

  const columnIndex = layout.rows[currentRowIndex].indexOf(itemId)
  const targetRow = layout.rows[targetRowIndex]
  const clampedColumn = Math.min(columnIndex, targetRow.length - 1)
  const targetItemId = targetRow[clampedColumn]
  const targetIndex = containerItemIds.indexOf(targetItemId)

  if (targetIndex < 0)
  {
    return null
  }

  return { targetIndex, targetItemId }
}

// resolve column-aware placement when moving an item across tiers
// picks the last row (ArrowUp) or first row (ArrowDown) of the target,
// preserving the item's column position from its source row
export const resolveColumnAwareCrossTierIndex = (
  sourceContainerId: string,
  itemId: string,
  targetContainerId: string,
  targetContainerItemIds: string[],
  direction: 'ArrowUp' | 'ArrowDown'
): IntraRowMoveResult | null =>
{
  const sourceLayout = getRenderedContainerRowLayout(sourceContainerId)

  // determine column from source row layout, default to 0
  let columnIndex = 0

  if (sourceLayout)
  {
    const sourceRowIndex = sourceLayout.rows.findIndex(
      (row) => row.includes(itemId)
    )

    if (sourceRowIndex >= 0)
    {
      columnIndex = sourceLayout.rows[sourceRowIndex].indexOf(itemId)
    }
  }

  const targetLayout = getRenderedContainerRowLayout(targetContainerId)

  if (!targetLayout || targetLayout.rowCount === 0)
  {
    // target is empty or DOM unavailable — fall back to default placement
    return null
  }

  // ArrowUp → land on the last row, ArrowDown → land on the first row
  const targetRow = direction === 'ArrowUp'
    ? targetLayout.rows[targetLayout.rowCount - 1]
    : targetLayout.rows[0]

  const clampedColumn = Math.min(columnIndex, targetRow.length - 1)
  const targetItemId = targetRow[clampedColumn]
  const targetIndex = targetContainerItemIds.indexOf(targetItemId)

  if (targetIndex < 0)
  {
    return null
  }

  return { targetIndex, targetItemId }
}
