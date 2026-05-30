// src/features/workspace/boards/dnd/dragCollision.ts
// drag collision helper — stabilize dnd-kit hit testing across moving containers

import type { MutableRefObject } from 'react'
import {
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type ClientRect,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { toStringId } from '~/features/workspace/boards/dnd/dragHelpers'
import { TRASH_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { brandedStringArrayIncludes } from '~/shared/lib/typeGuards'
import {
  findContainer,
  getItemsInContainer,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import {
  isPointerInVisualAppendSpace,
  resolvePointerCell,
} from '~/features/workspace/boards/dnd/dragLayoutRows'
import {
  createDragCellLayoutLookup,
  type DragLayoutSession,
  type FrozenCellLayout,
} from '~/features/workspace/boards/dnd/dragLayoutSession'
import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'

// resolve the drag-over target from frozen cell geometry: stable cells pick the
// slot, the live preview order names its current occupant. returns null to defer
// to the live closestCenter path
const resolveFrozenOver = (
  frozen: FrozenCellLayout,
  snapshot: ContainerSnapshot,
  containerId: string,
  pointer: { x: number; y: number },
  liveContainerRect: ClientRect | undefined
): { id: UniqueIdentifier; rect: ClientRect | null } | null =>
{
  const { cellLayout, origin } = frozen

  // rebase the live pointer into capture space — a no-op unless the grid
  // scrolled mid-drag (auto-scroll / page scroll)
  const shiftX = liveContainerRect ? liveContainerRect.left - origin.left : 0
  const shiftY = liveContainerRect ? liveContainerRect.top - origin.top : 0
  const hit = resolvePointerCell(cellLayout, {
    x: pointer.x - shiftX,
    y: pointer.y - shiftY,
  })
  if (!hit)
  {
    return null
  }

  if (hit.kind === 'append')
  {
    return { id: containerId, rect: null }
  }

  // occupant of the frozen slot in the CURRENT preview order, filtered to the
  // rendered/visible set so the pool search filter maps cells correctly
  const visible = new Set(cellLayout.flatItemIds)
  const order = getItemsInContainer(snapshot, containerId).filter((id) =>
    visible.has(id)
  )
  if (order.length !== cellLayout.flatItemIds.length)
  {
    return null
  }

  const occupant = order[hit.flatIndex]
  if (!occupant)
  {
    return null
  }

  // the occupant's frozen slot box in live coords — a stable overRect for the
  // insertion midpoint, immune to mid-transition re-measurement
  const cell = cellLayout.cells[hit.flatIndex]
  const rect: ClientRect = {
    left: cell.left + shiftX,
    right: cell.right + shiftX,
    top: cell.top + shiftY,
    bottom: cell.bottom + shiftY,
    width: cell.right - cell.left,
    height: cell.bottom - cell.top,
  }

  return { id: occupant, rect }
}

export const resolveDragCollisions = (
  args: Parameters<CollisionDetection>[0],
  lastOverIdRef: MutableRefObject<UniqueIdentifier | null>,
  movedToNewContainerRef: MutableRefObject<boolean>,
  getCurrentSnapshot: () => ContainerSnapshot,
  getTierIds: () => ReadonlySet<string>,
  cellSessionRef: MutableRefObject<DragLayoutSession | null>,
  frozenOverRef: MutableRefObject<{ id: string; rect: ClientRect } | null>
): ReturnType<CollisionDetection> =>
{
  const activeId = toStringId(args.active.id)
  if (!activeId)
  {
    return []
  }

  // tier drag — use closestCenter against tier IDs only
  if (args.active.data.current?.type === 'tier')
  {
    const tierIds = getTierIds()
    const tierContainers = args.droppableContainers.filter((c) =>
      tierIds.has(String(c.id))
    )
    return closestCenter({ ...args, droppableContainers: tierContainers })
  }

  // stale frozen overRect must never leak to the next move's insertion math
  frozenOverRef.current = null

  const state = getCurrentSnapshot()
  const pointerIntersections = pointerWithin(args)
  const intersections =
    pointerIntersections.length > 0
      ? pointerIntersections
      : rectIntersection(args)
  let overId = getFirstCollision(intersections, 'id')

  if (overId)
  {
    const overIdString = toStringId(overId)

    if (overIdString === TRASH_CONTAINER_ID)
    {
      lastOverIdRef.current = overId
      return [{ id: overId }]
    }

    const overContainerId = overIdString
      ? findContainer(state, overIdString)
      : null

    if (overIdString && overContainerId)
    {
      // frozen-cell path: stable while this container's captured geometry is
      // valid. skipped the frame after a cross-container move (until recapture)
      if (!movedToNewContainerRef.current && args.pointerCoordinates)
      {
        const frozen = createDragCellLayoutLookup(cellSessionRef.current)(
          overContainerId
        )
        if (frozen)
        {
          const resolved = resolveFrozenOver(
            frozen,
            state,
            overContainerId,
            args.pointerCoordinates,
            args.droppableRects.get(overContainerId)
          )
          if (resolved)
          {
            lastOverIdRef.current = resolved.id
            frozenOverRef.current = resolved.rect
              ? { id: String(resolved.id), rect: resolved.rect }
              : null
            return [{ id: resolved.id }]
          }
        }
      }

      // fallback: live closestCenter over child item rects
      const overItems = getItemsInContainer(state, overContainerId)

      if (overIdString === overContainerId && overItems.length > 0)
      {
        const childDroppables = args.droppableContainers.filter((container) =>
        {
          const containerId = toStringId(container.id)
          return containerId
            ? brandedStringArrayIncludes(overItems, containerId)
            : false
        })

        const nonActiveChildRects = childDroppables.flatMap((container) =>
        {
          if (toStringId(container.id) === activeId)
          {
            return []
          }

          const rect = args.droppableRects.get(container.id)
          return rect ? [rect] : []
        })

        if (
          args.pointerCoordinates &&
          isPointerInVisualAppendSpace({
            pointerCoordinates: args.pointerCoordinates,
            itemRects: nonActiveChildRects,
          })
        )
        {
          lastOverIdRef.current = overContainerId
          return [{ id: overContainerId }]
        }

        const itemCollisions = closestCenter({
          ...args,
          droppableContainers: childDroppables,
        })

        overId = itemCollisions[0]?.id ?? overId
      }

      lastOverIdRef.current = overId
      return [{ id: overId }]
    }
  }

  if (movedToNewContainerRef.current)
  {
    lastOverIdRef.current = activeId
  }

  if (
    lastOverIdRef.current &&
    toStringId(lastOverIdRef.current) === TRASH_CONTAINER_ID
  )
  {
    lastOverIdRef.current = activeId
  }

  return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : []
}
