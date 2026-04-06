// src/hooks/dragCollision.ts
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
import { useTierListStore } from '../store/useTierListStore'
import { TRASH_CONTAINER_ID } from '../utils/constants'
import {
  findContainer,
  getEffectiveContainerSnapshot,
  getItemsInContainer,
} from '../utils/dragSnapshot'
import { isPointerInTrailingLastRowSpace } from '../utils/dragPointerMath'

export const resolveDragCollisions = (
  args: Parameters<CollisionDetection>[0],
  lastOverIdRef: MutableRefObject<UniqueIdentifier | null>,
  movedToNewContainerRef: MutableRefObject<boolean>
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
    const tierIds = new Set(
      useTierListStore.getState().tiers.map((tier) => String(tier.id))
    )
    const tierContainers = args.droppableContainers.filter((c) =>
      tierIds.has(String(c.id))
    )
    return closestCenter({ ...args, droppableContainers: tierContainers })
  }

  const state = getEffectiveContainerSnapshot(useTierListStore.getState())
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
          return containerId ? overItems.includes(containerId) : false
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
