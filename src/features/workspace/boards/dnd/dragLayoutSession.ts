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
import { getOrderedContainerIds } from './dragSnapshot'
import {
  buildRenderedRowLayout,
  sortByRenderedPosition,
  type RenderedItemPosition,
  type RenderedRowLayout,
} from './dragLayoutRows'

export interface RenderedContainerLayout
{
  rowLayout: RenderedRowLayout
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
): RenderedItemPosition[] | null =>
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
      } satisfies RenderedItemPosition,
    ]
  })

  return positionedItems.length > 0
    ? sortByRenderedPosition(positionedItems)
    : null
}

export const captureRenderedContainerLayout = (
  containerId: string
): RenderedContainerLayout | null =>
{
  if (typeof document === 'undefined')
  {
    return null
  }

  const positionedItems = getPositionedItemsFromElement(
    document.querySelector(getContainerSelector(containerId))
  )

  if (!positionedItems)
  {
    return null
  }

  const rowLayout = buildRenderedRowLayout(positionedItems)

  if (!rowLayout)
  {
    return null
  }

  return { rowLayout }
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

export const getDragLayoutRowLayout = (
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
