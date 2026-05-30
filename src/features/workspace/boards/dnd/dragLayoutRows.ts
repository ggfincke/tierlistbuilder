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

// item position w/ full box — superset of RenderedItemPosition the cell layout
// needs for centers & trailing-edge math
export interface RenderedItemBox extends RenderedItemPosition
{
  right: number
  bottom: number
}

export interface RenderedRowLayout
{
  rows: ItemId[][]
  rowCount: number
}

// a single rendered grid slot w/ frozen geometry; cells don't move under
// same-container reorder, so hit-testing them never feeds the reflow loop
export interface RenderedCell
{
  itemId: ItemId
  rowIndex: number
  colIndex: number
  centerX: number
  centerY: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface RenderedCellLayout
{
  rows: ItemId[][]
  rowCount: number
  cells: RenderedCell[]
  flatItemIds: ItemId[]
}

export type PointerCellHit =
  | { kind: 'cell'; flatIndex: number; itemId: ItemId }
  | { kind: 'append' }

interface RowMoveResult
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

// bin sorted items into visual rows by top within tolerance — shared by the row
// layout (keyboard) & the cell layout (pointer) so the binning can't drift apart
const groupIntoRows = <T extends { itemId: ItemId; left: number; top: number }>(
  items: T[]
): T[][] =>
{
  const rows: T[][] = []
  const rowTops: number[] = []

  for (const item of sortByRenderedPosition(items))
  {
    const rowIndex = rowTops.length - 1
    const rowTop = rowTops[rowIndex]

    if (
      rowTop !== undefined &&
      Math.abs(rowTop - item.top) <= RENDERED_ROW_TOP_TOLERANCE_PX
    )
    {
      rows[rowIndex].push(item)
    }
    else
    {
      rowTops.push(item.top)
      rows.push([item])
    }
  }

  return rows
}

export const buildRenderedRowLayout = (
  positionedItems: RenderedItemPosition[]
): RenderedRowLayout | null =>
{
  if (positionedItems.length === 0)
  {
    return null
  }

  const rows = groupIntoRows(positionedItems).map((row) =>
    row.map((item) => item.itemId)
  )

  return { rows, rowCount: rows.length }
}

// frozen per-cell geometry for pointer collision — same binning pass as the row
// layout, but retains each box, its (row, col), & center
export const buildRenderedCellLayout = (
  boxes: RenderedItemBox[]
): RenderedCellLayout | null =>
{
  if (boxes.length === 0)
  {
    return null
  }

  const rows: ItemId[][] = []
  const cells: RenderedCell[] = []
  const flatItemIds: ItemId[] = []

  groupIntoRows(boxes).forEach((row, rowIndex) =>
  {
    rows.push(row.map((box) => box.itemId))
    row.forEach((box, colIndex) =>
    {
      cells.push({
        itemId: box.itemId,
        rowIndex,
        colIndex,
        centerX: (box.left + box.right) / 2,
        centerY: (box.top + box.bottom) / 2,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      })
      flatItemIds.push(box.itemId)
    })
  })

  return { rows, rowCount: rows.length, cells, flatItemIds }
}

// snap a pointer to a fixed grid cell or append slot using frozen geometry.
// pure & feedback-free — same layout + pointer resolves to the same cell every
// frame, which is what kills the wrap-boundary oscillation
export const resolvePointerCell = (
  layout: RenderedCellLayout,
  pointer: { x: number; y: number }
): PointerCellHit | null =>
{
  const { cells, rowCount } = layout
  if (cells.length === 0)
  {
    return null
  }

  // vertical band per row from the frozen cell boxes
  const bands = Array.from({ length: rowCount }, () => ({
    top: Infinity,
    bottom: -Infinity,
    indices: [] as number[],
  }))
  cells.forEach((cell, index) =>
  {
    const band = bands[cell.rowIndex]
    band.top = Math.min(band.top, cell.top)
    band.bottom = Math.max(band.bottom, cell.bottom)
    band.indices.push(index)
  })

  // row whose band contains the pointer, else nearest row; below final row
  // resolves to the synthetic append slot
  let rowIndex = bands.findIndex(
    (band) => pointer.y >= band.top && pointer.y <= band.bottom
  )
  if (rowIndex < 0)
  {
    if (pointer.y < bands[0].top)
    {
      rowIndex = 0
    }
    else if (pointer.y > bands[rowCount - 1].bottom)
    {
      return { kind: 'append' }
    }
    else
    {
      let bestDist = Infinity
      rowIndex = 0
      bands.forEach((band, index) =>
      {
        const center = (band.top + band.bottom) / 2
        const dist = Math.abs(pointer.y - center)
        if (dist < bestDist)
        {
          bestDist = dist
          rowIndex = index
        }
      })
    }
  }

  const band = bands[rowIndex]

  // pointer past the last row's rightmost edge -> append to the container end
  if (rowIndex === rowCount - 1)
  {
    let rightmost = -Infinity
    for (const index of band.indices)
    {
      rightmost = Math.max(rightmost, cells[index].right)
    }
    if (pointer.x > rightmost)
    {
      return { kind: 'append' }
    }
  }

  // nearest cell by horizontal center within the chosen row
  let bestIndex = band.indices[0]
  let bestDist = Infinity
  for (const index of band.indices)
  {
    const dist = Math.abs(cells[index].centerX - pointer.x)
    if (dist < bestDist)
    {
      bestDist = dist
      bestIndex = index
    }
  }

  return {
    kind: 'cell',
    flatIndex: bestIndex,
    itemId: cells[bestIndex].itemId,
  }
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

export const isPointerInVisualAppendSpace = ({
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
    (pointerCoordinates.y >= rowTop &&
      pointerCoordinates.y <= rowBottom &&
      pointerCoordinates.x >= rightmostEdge) ||
    pointerCoordinates.y > rowBottom
  )
}
