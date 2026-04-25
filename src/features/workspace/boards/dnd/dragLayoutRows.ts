// src/features/workspace/boards/dnd/dragLayoutRows.ts
// visual row helpers shared by pointer & keyboard drag logic

import type { ClientRect } from '@dnd-kit/core'
import type { Coordinates } from '@dnd-kit/utilities'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { RENDERED_ROW_TOP_TOLERANCE_PX } from '~/shared/overlay/uiMeasurements'

export interface RenderedItemPosition
{
  itemId: ItemId
  left: number
  top: number
}

export interface RenderedRowLayout
{
  rows: ItemId[][]
  rowCount: number
}

export interface RowMoveResult
{
  targetIndex: number
  targetItemId: ItemId
}

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

export const buildRenderedRowLayout = (
  positionedItems: RenderedItemPosition[]
): RenderedRowLayout | null =>
{
  if (positionedItems.length === 0)
  {
    return null
  }

  const rows: ItemId[][] = []
  const rowTops: number[] = []

  for (const item of sortByRenderedPosition(positionedItems))
  {
    const rowIndex = rowTops.length - 1
    const rowTop = rowTops[rowIndex]

    if (
      rowTop !== undefined &&
      Math.abs(rowTop - item.top) <= RENDERED_ROW_TOP_TOLERANCE_PX
    )
    {
      rows[rowIndex].push(item.itemId)
    }
    else
    {
      rowTops.push(item.top)
      rows.push([item.itemId])
    }
  }

  return { rows, rowCount: rows.length }
}

export const resolveIntraContainerRowMoveFromLayout = (
  layout: RenderedRowLayout | null,
  itemId: ItemId,
  direction: 'ArrowUp' | 'ArrowDown',
  containerItemIds: ItemId[]
): RowMoveResult | null =>
{
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
  const targetItemId = targetRow[Math.min(columnIndex, targetRow.length - 1)]
  const targetIndex = containerItemIds.indexOf(targetItemId)

  if (targetIndex < 0)
  {
    return null
  }

  return { targetIndex, targetItemId }
}

export const resolveColumnAwareCrossContainerIndexFromLayouts = (
  sourceLayout: RenderedRowLayout | null,
  targetLayout: RenderedRowLayout | null,
  itemId: ItemId,
  targetContainerItemIds: ItemId[],
  direction: 'ArrowUp' | 'ArrowDown'
): RowMoveResult | null =>
{
  if (!targetLayout || targetLayout.rowCount === 0)
  {
    return null
  }

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

  const targetRow =
    direction === 'ArrowUp'
      ? targetLayout.rows[targetLayout.rowCount - 1]
      : targetLayout.rows[0]
  const targetItemId = targetRow[Math.min(columnIndex, targetRow.length - 1)]
  const targetIndex = targetContainerItemIds.indexOf(targetItemId)

  if (targetIndex < 0)
  {
    return null
  }

  return { targetIndex, targetItemId }
}

export const isPointerInTrailingLastRowSpace = ({
  pointerCoordinates,
  itemRects,
}: {
  pointerCoordinates: Coordinates | null
  itemRects: ClientRect[]
}): boolean =>
{
  if (!pointerCoordinates || itemRects.length === 0)
  {
    return false
  }

  let lastRowTop = -Infinity
  for (const rect of itemRects)
  {
    lastRowTop = Math.max(lastRowTop, rect.top)
  }

  let rowTop = Infinity
  let rowBottom = -Infinity
  let rightmostEdge = -Infinity

  for (const rect of itemRects)
  {
    if (Math.abs(rect.top - lastRowTop) > RENDERED_ROW_TOP_TOLERANCE_PX)
      continue
    rowTop = Math.min(rowTop, rect.top)
    rowBottom = Math.max(rowBottom, rect.bottom)
    rightmostEdge = Math.max(rightmostEdge, rect.right)
  }

  return (
    pointerCoordinates.y >= rowTop &&
    pointerCoordinates.y <= rowBottom &&
    pointerCoordinates.x >= rightmostEdge
  )
}
