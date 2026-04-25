// src/features/workspace/boards/dnd/dragEndDecision.ts
// pure pointer drag-end decision helper for dnd-kit adapters

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { TRASH_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { findContainer } from './dragSnapshot'

export type DragEndActiveState =
  | { kind: 'idle' }
  | { kind: 'item'; itemId: ItemId }
  | { kind: 'tier'; tierId: string }

export type DragEndDecision =
  | { kind: 'item-cancel'; itemId: ItemId }
  | { kind: 'item-commit'; itemId: ItemId; resyncContainerId: string | null }
  | { kind: 'item-trash'; itemId: ItemId }
  | { kind: 'reset' }
  | { kind: 'tier-reorder'; fromIndex: number; toIndex: number }

interface ResolveDragEndDecisionArgs
{
  activeDrag: DragEndActiveState
  activeFallbackId: ItemId | null
  hasOver: boolean
  overId: string | null
  snapshot: ContainerSnapshot
  tierIds: readonly string[]
}

export const resolveDragEndDecision = ({
  activeDrag,
  activeFallbackId,
  hasOver,
  overId,
  snapshot,
  tierIds,
}: ResolveDragEndDecisionArgs): DragEndDecision =>
{
  if (activeDrag.kind === 'tier')
  {
    if (!overId || activeDrag.tierId === overId)
    {
      return { kind: 'reset' }
    }

    const fromIndex = tierIds.indexOf(activeDrag.tierId)
    const toIndex = tierIds.indexOf(overId)

    return fromIndex >= 0 && toIndex >= 0
      ? { kind: 'tier-reorder', fromIndex, toIndex }
      : { kind: 'reset' }
  }

  const itemId =
    activeDrag.kind === 'item' ? activeDrag.itemId : activeFallbackId

  if (!itemId)
  {
    return { kind: 'reset' }
  }

  if (!hasOver)
  {
    return { kind: 'item-cancel', itemId }
  }

  if (overId === TRASH_CONTAINER_ID)
  {
    return { kind: 'item-trash', itemId }
  }

  const activeContainerId = findContainer(snapshot, itemId)
  const overContainerId = overId ? findContainer(snapshot, overId) : null
  const resyncContainerId =
    activeContainerId &&
    overContainerId &&
    activeContainerId === overContainerId
      ? activeContainerId
      : null

  return { kind: 'item-commit', itemId, resyncContainerId }
}
