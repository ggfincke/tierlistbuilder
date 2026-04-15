// src/features/workspace/boards/dnd/dragDomCapture.ts
// DOM reading utilities for rendered container layout & position data

import type { ClientRect } from '@dnd-kit/core'

import type { ContainerSnapshot } from '@/features/workspace/boards/model/runtime'
import { RENDERED_ROW_TOP_TOLERANCE_PX } from '@/shared/overlay/uiMeasurements'
import { UNRANKED_CONTAINER_ID } from '@/features/workspace/boards/lib/dndIds'
import { asItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'

export const sortByRenderedPosition = <
  T extends Pick<ClientRect, 'left' | 'top'>,
>(
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

interface RenderedItemPosition
{
  itemId: ItemId
  left: number
  top: number
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
        itemId: asItemId(itemId),
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
  fallbackItemIds: ItemId[]
): ItemId[] =>
{
  const positioned = getPositionedItemsFromElement(containerElement)
  return positioned
    ? positioned.map((item) => item.itemId)
    : [...fallbackItemIds]
}

export const captureRenderedContainerSnapshot = (
  snapshot: ContainerSnapshot,
  containerId?: string
): ContainerSnapshot | null =>
{
  if (typeof document === 'undefined')
  {
    return null
  }

  // when scoped to a single container, only re-read that container's DOM
  if (containerId)
  {
    if (containerId === UNRANKED_CONTAINER_ID)
    {
      return {
        ...snapshot,
        unrankedItemIds: getRenderedItemIds(
          document.querySelector('[data-testid="unranked-container"]'),
          snapshot.unrankedItemIds
        ),
      }
    }

    return {
      ...snapshot,
      tiers: snapshot.tiers.map((tier) =>
        tier.id === containerId
          ? {
              ...tier,
              itemIds: getRenderedItemIds(
                document.querySelector(
                  `[data-testid="tier-container-${tier.id}"]`
                ),
                tier.itemIds
              ),
            }
          : tier
      ),
    }
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
  rows: ItemId[][]
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

  const rows: ItemId[][] = []
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
  targetItemId: ItemId
}

// resolve an intra-container row move for ArrowUp/ArrowDown in multi-row containers
export const resolveIntraContainerRowMove = (
  containerId: string,
  itemId: ItemId,
  direction: 'ArrowUp' | 'ArrowDown',
  containerItemIds: ItemId[]
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
  itemId: ItemId,
  targetContainerId: string,
  targetContainerItemIds: ItemId[],
  direction: 'ArrowUp' | 'ArrowDown'
): IntraRowMoveResult | null =>
{
  const sourceLayout = getRenderedContainerRowLayout(sourceContainerId)

  // determine column from source row layout, default to 0
  let columnIndex = 0

  if (sourceLayout)
  {
    const sourceRowIndex = sourceLayout.rows.findIndex((row) =>
      row.includes(itemId)
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
  const targetRow =
    direction === 'ArrowUp'
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
