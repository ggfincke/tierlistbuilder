// src/features/workspace/boards/dnd/dragCollision.ts
// drag collision helper — stabilize dnd-kit hit testing across moving containers

import type { MutableRefObject } from 'react'
import {
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { toStringId } from './dragHelpers'
import { TRASH_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { brandedStringArrayIncludes } from '~/shared/lib/typeGuards'
import {
  findContainer,
  getItemsInContainer,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import { isPointerInTrailingLastRowSpace } from './dragLayoutRows'
import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'

export const resolveDragCollisions = (
  args: Parameters<CollisionDetection>[0],
  lastOverIdRef: MutableRefObject<UniqueIdentifier | null>,
  movedToNewContainerRef: MutableRefObject<boolean>,
  getCurrentSnapshot: () => ContainerSnapshot,
  getTierIds: () => ReadonlySet<string>
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
          isPointerInTrailingLastRowSpace({
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
