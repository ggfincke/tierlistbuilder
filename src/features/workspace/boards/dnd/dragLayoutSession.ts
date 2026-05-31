// src/features/workspace/boards/dnd/dragLayoutSession.ts
// DOM-backed layout session for rendered drag containers

import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import {
  ALL_ITEM_ELEMENTS_SELECTOR,
  UNRANKED_CONTAINER_ID,
} from '~/features/workspace/boards/lib/dndIds'
import {
  UNRANKED_CONTAINER_SELECTOR,
  tierContainerSelector,
} from '~/shared/board-ui/boardTestIds'
import { asItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { getOrderedContainerIds } from '~/features/workspace/boards/dnd/dragSnapshot'
import {
  buildRenderedCellLayout,
  type RenderedCellLayout,
  type RenderedItemBox,
  type RenderedRowLayout,
} from '~/features/workspace/boards/dnd/dragLayoutRows'

interface RenderedContainerLayout
{
  rowLayout: RenderedRowLayout
  cellLayout: RenderedCellLayout
  // container client rect at capture — lets the pointer rebase into cell space
  // when the grid scrolls mid-drag
  origin: { left: number; top: number }
}

// frozen cell geometry for one container handed to pointer collision
export interface FrozenCellLayout
{
  cellLayout: RenderedCellLayout
  origin: { left: number; top: number }
}

export interface DragLayoutSession
{
  containers: Map<string, RenderedContainerLayout>
}

export type DragRowLayoutLookup = (
  containerId: string
) => RenderedRowLayout | null

export const NO_DRAG_ROW_LAYOUT_LOOKUP: DragRowLayoutLookup = () => null

const getContainerSelector = (containerId: string): string =>
  containerId === UNRANKED_CONTAINER_ID
    ? UNRANKED_CONTAINER_SELECTOR
    : tierContainerSelector(containerId)

const getPositionedItemsFromElement = (
  containerElement: Element | null
): RenderedItemBox[] | null =>
{
  if (!containerElement)
  {
    return null
  }

  const positionedItems = Array.from(
    containerElement.querySelectorAll<HTMLElement>(ALL_ITEM_ELEMENTS_SELECTOR)
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
        itemId: asItemId(itemId),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      } satisfies RenderedItemBox,
    ]
  })

  // buildRenderedCellLayout -> groupIntoRows re-sorts, so don't pre-sort here
  return positionedItems.length > 0 ? positionedItems : null
}

export const captureRenderedContainerLayout = (
  containerId: string
): RenderedContainerLayout | null =>
{
  if (typeof document === 'undefined')
  {
    return null
  }

  const containerElement = document.querySelector(
    getContainerSelector(containerId)
  )

  if (!containerElement)
  {
    return null
  }

  const positionedItems = getPositionedItemsFromElement(containerElement)

  if (!positionedItems)
  {
    return null
  }

  const cellLayout = buildRenderedCellLayout(positionedItems)

  if (!cellLayout)
  {
    return null
  }

  const rect = containerElement.getBoundingClientRect()

  return {
    rowLayout: { rows: cellLayout.rows, rowCount: cellLayout.rowCount },
    cellLayout,
    origin: { left: rect.left, top: rect.top },
  }
}

export const captureDragLayoutSession = (
  snapshot: ContainerSnapshot
): DragLayoutSession | null =>
{
  if (typeof document === 'undefined')
  {
    return null
  }

  const containers = new Map<string, RenderedContainerLayout>()

  for (const containerId of getOrderedContainerIds(snapshot))
  {
    const layout = captureRenderedContainerLayout(containerId)

    if (layout)
    {
      containers.set(containerId, layout)
    }
  }

  return { containers }
}

export const getDragLayoutItemIds = (
  session: DragLayoutSession | null,
  containerId: string,
  fallbackItemIds: ItemId[]
): ItemId[] =>
{
  const entry = session?.containers.get(containerId)
  return entry ? entry.rowLayout.rows.flat() : [...fallbackItemIds]
}

const getDragLayoutRowLayout = (
  session: DragLayoutSession | null,
  containerId: string
): RenderedRowLayout | null =>
{
  return session?.containers.get(containerId)?.rowLayout ?? null
}

export const createDragRowLayoutLookup = (
  session: DragLayoutSession | null
): DragRowLayoutLookup =>
{
  if (!session)
  {
    return NO_DRAG_ROW_LAYOUT_LOOKUP
  }

  return (containerId) => getDragLayoutRowLayout(session, containerId)
}

export type DragCellLayoutLookup = (
  containerId: string
) => FrozenCellLayout | null

const NO_DRAG_CELL_LAYOUT_LOOKUP: DragCellLayoutLookup = () => null

export const createDragCellLayoutLookup = (
  session: DragLayoutSession | null
): DragCellLayoutLookup =>
{
  if (!session)
  {
    return NO_DRAG_CELL_LAYOUT_LOOKUP
  }

  return (containerId) =>
  {
    const entry = session.containers.get(containerId)
    return entry ? { cellLayout: entry.cellLayout, origin: entry.origin } : null
  }
}
