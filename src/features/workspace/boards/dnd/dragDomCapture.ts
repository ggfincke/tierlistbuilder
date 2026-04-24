// src/features/workspace/boards/dnd/dragDomCapture.ts
// DOM readers that rebuild rendered container order from layout sessions

import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import {
  captureDragLayoutSession,
  captureRenderedContainerLayout,
  getDragLayoutItemIds,
  type DragLayoutSession,
} from './dragLayoutSession'

const captureScopedDragLayoutSession = (
  containerId: string
): DragLayoutSession | null =>
{
  const layout = captureRenderedContainerLayout(containerId)

  return layout ? { containers: new Map([[containerId, layout]]) } : null
}

export const captureRenderedContainerSnapshot = (
  snapshot: ContainerSnapshot,
  containerId?: string,
  session?: DragLayoutSession | null
): ContainerSnapshot | null =>
{
  const layoutSession =
    session ??
    (containerId
      ? captureScopedDragLayoutSession(containerId)
      : captureDragLayoutSession(snapshot))

  if (!layoutSession)
  {
    return null
  }

  if (containerId)
  {
    if (containerId === UNRANKED_CONTAINER_ID)
    {
      return {
        ...snapshot,
        unrankedItemIds: getDragLayoutItemIds(
          layoutSession,
          UNRANKED_CONTAINER_ID,
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
              itemIds: getDragLayoutItemIds(
                layoutSession,
                tier.id,
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
      itemIds: getDragLayoutItemIds(layoutSession, tier.id, tier.itemIds),
    })),
    unrankedItemIds: getDragLayoutItemIds(
      layoutSession,
      UNRANKED_CONTAINER_ID,
      snapshot.unrankedItemIds
    ),
  }
}
