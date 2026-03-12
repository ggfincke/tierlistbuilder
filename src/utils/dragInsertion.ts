import type { ClientRect, Translate } from '@dnd-kit/core'

import type { ContainerSnapshot, Tier, TierListData } from '../types'
import { UNRANKED_CONTAINER_ID, clampIndex } from './constants'

interface GetDraggedItemRectArgs {
  translatedRect: ClientRect | null
  initialRect: ClientRect | null
  delta: Translate
}

interface ResolveDragTargetIndexArgs {
  draggedRect: ClientRect | null
  overRect: ClientRect
  overId: string
  overContainerId: string
  overIndex: number
  overItemsLength: number
}

interface ResolveStoreInsertionIndexArgs {
  sameContainer: boolean
  sourceIndex: number
  targetIndex: number
  targetItemsLength: number
}

interface ResolveNextDragPreviewArgs {
  snapshot: ContainerSnapshot
  itemId: string
  overId: string
  draggedRect: ClientRect | null
  overRect: ClientRect
}

interface RenderedItemPosition {
  itemId: string
  left: number
  top: number
}

type ContainerState = Pick<TierListData, 'tiers' | 'unrankedItemIds'>

const hasContainer = (snapshot: ContainerSnapshot, containerId: string): boolean => {
  return (
    containerId === UNRANKED_CONTAINER_ID ||
    snapshot.tiers.some((tier) => tier.id === containerId)
  )
}

const withContainerItems = (
  snapshot: ContainerSnapshot,
  containerId: string,
  nextItemIds: string[],
): ContainerSnapshot => {
  if (containerId === UNRANKED_CONTAINER_ID) {
    return {
      ...snapshot,
      unrankedItemIds: [...nextItemIds],
    }
  }

  return {
    ...snapshot,
    tiers: snapshot.tiers.map((tier) =>
      tier.id === containerId ? { ...tier, itemIds: [...nextItemIds] } : tier,
    ),
  }
}

export const createContainerSnapshot = (state: ContainerState): ContainerSnapshot => ({
  tiers: state.tiers.map((tier) => ({
    id: tier.id,
    itemIds: [...tier.itemIds],
  })),
  unrankedItemIds: [...state.unrankedItemIds],
})

export const getEffectiveContainerSnapshot = (
  state: ContainerState & { dragPreview: ContainerSnapshot | null },
): ContainerSnapshot => {
  return state.dragPreview ?? createContainerSnapshot(state)
}

export const getEffectiveTiers = (
  tiers: Tier[],
  dragPreview: ContainerSnapshot | null,
): Tier[] => {
  if (!dragPreview) {
    return tiers
  }

  const itemIdsByTierId = new Map(
    dragPreview.tiers.map((tier) => [tier.id, tier.itemIds] as const),
  )

  return tiers.map((tier) => ({
    ...tier,
    itemIds: [...(itemIdsByTierId.get(tier.id) ?? tier.itemIds)],
  }))
}

export const getEffectiveUnrankedItemIds = (
  unrankedItemIds: string[],
  dragPreview: ContainerSnapshot | null,
): string[] => {
  return dragPreview ? [...dragPreview.unrankedItemIds] : unrankedItemIds
}

export const applyContainerSnapshotToTiers = (
  tiers: Tier[],
  snapshot: ContainerSnapshot,
): Tier[] => {
  const itemIdsByTierId = new Map(snapshot.tiers.map((tier) => [tier.id, tier.itemIds] as const))

  return tiers.map((tier) => ({
    ...tier,
    itemIds: [...(itemIdsByTierId.get(tier.id) ?? tier.itemIds)],
  }))
}

export const findContainer = (snapshot: ContainerSnapshot, id: string): string | null => {
  if (id === UNRANKED_CONTAINER_ID) {
    return UNRANKED_CONTAINER_ID
  }

  if (snapshot.tiers.some((tier) => tier.id === id)) {
    return id
  }

  if (snapshot.unrankedItemIds.includes(id)) {
    return UNRANKED_CONTAINER_ID
  }

  const parentTier = snapshot.tiers.find((tier) => tier.itemIds.includes(id))
  return parentTier?.id ?? null
}

export const getItemsInContainer = (
  snapshot: ContainerSnapshot,
  containerId: string,
): string[] => {
  if (containerId === UNRANKED_CONTAINER_ID) {
    return snapshot.unrankedItemIds
  }

  return snapshot.tiers.find((tier) => tier.id === containerId)?.itemIds ?? []
}

// rebuild the active rect when dnd-kit hasn't populated the translated rect yet
export const getDraggedItemRect = ({
  translatedRect,
  initialRect,
  delta,
}: GetDraggedItemRectArgs): ClientRect | null => {
  if (translatedRect) {
    return translatedRect
  }

  if (!initialRect) {
    return null
  }

  return {
    ...initialRect,
    top: initialRect.top + delta.y,
    bottom: initialRect.bottom + delta.y,
    left: initialRect.left + delta.x,
    right: initialRect.right + delta.x,
  }
}

// preserve the normal between-item threshold while honoring explicit front/back drops
export const resolveDragTargetIndex = ({
  draggedRect,
  overRect,
  overId,
  overContainerId,
  overIndex,
  overItemsLength,
}: ResolveDragTargetIndexArgs): number => {
  if (overId === overContainerId) {
    return overItemsLength
  }

  if (draggedRect && overIndex === 0 && draggedRect.left < overRect.left) {
    return 0
  }

  if (
    draggedRect &&
    overIndex === overItemsLength - 1 &&
    draggedRect.right > overRect.right
  ) {
    return overItemsLength
  }

  const draggedMidX = draggedRect
    ? draggedRect.left + draggedRect.width / 2
    : overRect.left + overRect.width / 2
  const overMidX = overRect.left + overRect.width / 2

  return draggedMidX > overMidX ? overIndex + 1 : overIndex
}

// convert a pre-removal target index into the actual splice position used by the store
export const resolveStoreInsertionIndex = ({
  sameContainer,
  sourceIndex,
  targetIndex,
  targetItemsLength,
}: ResolveStoreInsertionIndexArgs): number => {
  const normalizedTargetIndex =
    sameContainer && targetIndex > sourceIndex ? targetIndex - 1 : targetIndex

  return clampIndex(normalizedTargetIndex, 0, targetItemsLength)
}

export const moveItemInSnapshot = (
  snapshot: ContainerSnapshot,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number,
): ContainerSnapshot => {
  if (!hasContainer(snapshot, fromContainerId) || !hasContainer(snapshot, toContainerId)) {
    return snapshot
  }

  const sourceItems = [...getItemsInContainer(snapshot, fromContainerId)]
  const sourceIndex = sourceItems.indexOf(itemId)
  if (sourceIndex < 0) {
    return snapshot
  }

  sourceItems.splice(sourceIndex, 1)
  const sourcePatchedSnapshot = withContainerItems(snapshot, fromContainerId, sourceItems)

  const targetItems =
    fromContainerId === toContainerId
      ? sourceItems
      : [...getItemsInContainer(sourcePatchedSnapshot, toContainerId)]

  const insertionIndex = resolveStoreInsertionIndex({
    sameContainer: fromContainerId === toContainerId,
    sourceIndex,
    targetIndex: toIndex,
    targetItemsLength: targetItems.length,
  })

  if (fromContainerId === toContainerId && insertionIndex === sourceIndex) {
    return snapshot
  }

  targetItems.splice(insertionIndex, 0, itemId)

  return withContainerItems(sourcePatchedSnapshot, toContainerId, targetItems)
}

export const resolveNextDragPreview = ({
  snapshot,
  itemId,
  overId,
  draggedRect,
  overRect,
}: ResolveNextDragPreviewArgs): ContainerSnapshot => {
  const fromContainerId = findContainer(snapshot, itemId)
  const toContainerId = findContainer(snapshot, overId)

  if (!fromContainerId || !toContainerId) {
    return snapshot
  }

  const sourceItems = getItemsInContainer(snapshot, fromContainerId)
  const targetItems = getItemsInContainer(snapshot, toContainerId)
  const sourceIndex = sourceItems.indexOf(itemId)
  const overIndex = targetItems.indexOf(overId)
  const targetIndex = resolveDragTargetIndex({
    draggedRect,
    overRect,
    overId,
    overContainerId: toContainerId,
    overIndex,
    overItemsLength: targetItems.length,
  })

  if (sourceIndex < 0 || targetIndex < 0) {
    return snapshot
  }

  if (
    fromContainerId === toContainerId &&
    (sourceIndex === targetIndex || sourceIndex === targetIndex - 1)
  ) {
    return snapshot
  }

  return moveItemInSnapshot(snapshot, itemId, fromContainerId, toContainerId, targetIndex)
}

const getRenderedItemIds = (
  containerElement: Element | null,
  fallbackItemIds: string[],
): string[] => {
  if (!containerElement) {
    return [...fallbackItemIds]
  }

  const positionedItems = Array.from(
    containerElement.querySelectorAll<HTMLElement>('[data-item-id]'),
  ).flatMap((element) => {
    const itemId = element.dataset.itemId
    if (!itemId) {
      return []
    }

    const rect = element.getBoundingClientRect()

    return [
      {
        itemId,
        left: rect.left,
        top: rect.top,
      } satisfies RenderedItemPosition,
    ]
  })

  if (positionedItems.length === 0) {
    return [...fallbackItemIds]
  }

  positionedItems.sort((left, right) => {
    const topDelta = left.top - right.top
    if (Math.abs(topDelta) > 4) {
      return topDelta
    }

    return left.left - right.left
  })

  return positionedItems.map((item) => item.itemId)
}

export const captureRenderedContainerSnapshot = (
  snapshot: ContainerSnapshot,
): ContainerSnapshot | null => {
  if (typeof document === 'undefined') {
    return null
  }

  return {
    tiers: snapshot.tiers.map((tier) => ({
      id: tier.id,
      itemIds: getRenderedItemIds(
        document.querySelector(`[data-testid="tier-container-${tier.id}"]`),
        tier.itemIds,
      ),
    })),
    unrankedItemIds: getRenderedItemIds(
      document.querySelector('[data-testid="unranked-container"]'),
      snapshot.unrankedItemIds,
    ),
  }
}
