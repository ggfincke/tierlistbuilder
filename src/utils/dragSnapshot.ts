// src/utils/dragSnapshot.ts
// pure snapshot transforms & container queries for drag-&-drop state

import type { ContainerSnapshot, Tier, TierListData } from '../types'
import { UNRANKED_CONTAINER_ID, clampIndex } from './constants'

interface ResolveStoreInsertionIndexArgs
{
  sameContainer: boolean
  sourceIndex: number
  targetIndex: number
  targetItemsLength: number
}

interface MoveItemToIndexInSnapshotArgs
{
  snapshot: ContainerSnapshot
  itemId: string
  toContainerId: string
  toIndex: number
}

type ContainerState = Pick<TierListData, 'tiers' | 'unrankedItemIds'>

const hasContainer = (
  snapshot: ContainerSnapshot,
  containerId: string
): boolean =>
{
  return (
    containerId === UNRANKED_CONTAINER_ID ||
    snapshot.tiers.some((tier) => tier.id === containerId)
  )
}

const withContainerItems = (
  snapshot: ContainerSnapshot,
  containerId: string,
  nextItemIds: string[]
): ContainerSnapshot =>
{
  if (containerId === UNRANKED_CONTAINER_ID)
  {
    return {
      ...snapshot,
      unrankedItemIds: [...nextItemIds],
    }
  }

  return {
    ...snapshot,
    tiers: snapshot.tiers.map((tier) =>
      tier.id === containerId ? { ...tier, itemIds: [...nextItemIds] } : tier
    ),
  }
}

export const createContainerSnapshot = (
  state: ContainerState
): ContainerSnapshot => ({
  tiers: state.tiers.map((tier) => ({
    id: tier.id,
    itemIds: [...tier.itemIds],
  })),
  unrankedItemIds: [...state.unrankedItemIds],
})

export const getEffectiveContainerSnapshot = (
  state: ContainerState & { dragPreview: ContainerSnapshot | null }
): ContainerSnapshot =>
{
  return state.dragPreview ?? createContainerSnapshot(state)
}

export const getEffectiveTiers = (
  tiers: Tier[],
  dragPreview: ContainerSnapshot | null
): Tier[] =>
{
  if (!dragPreview)
  {
    return tiers
  }

  const itemIdsByTierId = new Map(
    dragPreview.tiers.map((tier) => [tier.id, tier.itemIds] as const)
  )

  return tiers.map((tier) => ({
    ...tier,
    itemIds: [...(itemIdsByTierId.get(tier.id) ?? tier.itemIds)],
  }))
}

export const getEffectiveUnrankedItemIds = (
  unrankedItemIds: string[],
  dragPreview: ContainerSnapshot | null
): string[] =>
{
  return dragPreview ? [...dragPreview.unrankedItemIds] : unrankedItemIds
}

export const applyContainerSnapshotToTiers = (
  tiers: Tier[],
  snapshot: ContainerSnapshot
): Tier[] =>
{
  const itemIdsByTierId = new Map(
    snapshot.tiers.map((tier) => [tier.id, tier.itemIds] as const)
  )

  return tiers.map((tier) => ({
    ...tier,
    itemIds: [...(itemIdsByTierId.get(tier.id) ?? tier.itemIds)],
  }))
}

// verify that a snapshot references exactly the same item IDs as the live state
// (catches orphans & missing items — not intra-source duplicates)
export const isSnapshotConsistent = (
  snapshot: ContainerSnapshot,
  state: ContainerState
): boolean =>
{
  // fast path: bail on count mismatch before building Sets
  const snapshotCount =
    snapshot.tiers.reduce((n, t) => n + t.itemIds.length, 0) +
    snapshot.unrankedItemIds.length
  const storeCount =
    state.tiers.reduce((n, t) => n + t.itemIds.length, 0) +
    state.unrankedItemIds.length

  if (snapshotCount !== storeCount)
  {
    return false
  }

  const storeIds = new Set([
    ...state.tiers.flatMap((tier) => tier.itemIds),
    ...state.unrankedItemIds,
  ])

  for (const tier of snapshot.tiers)
  {
    for (const id of tier.itemIds)
    {
      if (!storeIds.has(id))
      {
        return false
      }
    }
  }

  for (const id of snapshot.unrankedItemIds)
  {
    if (!storeIds.has(id))
    {
      return false
    }
  }

  return true
}

export const findContainer = (
  snapshot: ContainerSnapshot,
  id: string
): string | null =>
{
  if (id === UNRANKED_CONTAINER_ID)
  {
    return UNRANKED_CONTAINER_ID
  }

  if (snapshot.tiers.some((tier) => tier.id === id))
  {
    return id
  }

  if (snapshot.unrankedItemIds.includes(id))
  {
    return UNRANKED_CONTAINER_ID
  }

  const parentTier = snapshot.tiers.find((tier) => tier.itemIds.includes(id))
  return parentTier?.id ?? null
}

export const getItemsInContainer = (
  snapshot: ContainerSnapshot,
  containerId: string
): string[] =>
{
  if (containerId === UNRANKED_CONTAINER_ID)
  {
    return snapshot.unrankedItemIds
  }

  return snapshot.tiers.find((tier) => tier.id === containerId)?.itemIds ?? []
}

// convert a pre-removal target index into the actual splice position used by the store
export const resolveStoreInsertionIndex = ({
  sameContainer,
  sourceIndex,
  targetIndex,
  targetItemsLength,
}: ResolveStoreInsertionIndexArgs): number =>
{
  const normalizedTargetIndex =
    sameContainer && targetIndex > sourceIndex ? targetIndex - 1 : targetIndex

  return clampIndex(normalizedTargetIndex, 0, targetItemsLength)
}

export const moveItemInSnapshot = (
  snapshot: ContainerSnapshot,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number
): ContainerSnapshot =>
{
  if (
    !hasContainer(snapshot, fromContainerId) ||
    !hasContainer(snapshot, toContainerId)
  )
  {
    return snapshot
  }

  const sourceItems = [...getItemsInContainer(snapshot, fromContainerId)]
  const sourceIndex = sourceItems.indexOf(itemId)
  if (sourceIndex < 0)
  {
    return snapshot
  }

  sourceItems.splice(sourceIndex, 1)
  const sourcePatchedSnapshot = withContainerItems(
    snapshot,
    fromContainerId,
    sourceItems
  )

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

  if (fromContainerId === toContainerId && insertionIndex === sourceIndex)
  {
    return snapshot
  }

  targetItems.splice(insertionIndex, 0, itemId)

  return withContainerItems(sourcePatchedSnapshot, toContainerId, targetItems)
}

export const moveItemToIndexInSnapshot = ({
  snapshot,
  itemId,
  toContainerId,
  toIndex,
}: MoveItemToIndexInSnapshotArgs): ContainerSnapshot =>
{
  const fromContainerId = findContainer(snapshot, itemId)

  if (
    !fromContainerId ||
    !hasContainer(snapshot, fromContainerId) ||
    !hasContainer(snapshot, toContainerId)
  )
  {
    return snapshot
  }

  const sourceItems = [...getItemsInContainer(snapshot, fromContainerId)]
  const sourceIndex = sourceItems.indexOf(itemId)

  if (sourceIndex < 0)
  {
    return snapshot
  }

  sourceItems.splice(sourceIndex, 1)
  const sourcePatchedSnapshot = withContainerItems(
    snapshot,
    fromContainerId,
    sourceItems
  )
  const targetItems =
    fromContainerId === toContainerId
      ? sourceItems
      : [...getItemsInContainer(sourcePatchedSnapshot, toContainerId)]
  const insertionIndex = clampIndex(toIndex, 0, targetItems.length)

  if (fromContainerId === toContainerId && insertionIndex === sourceIndex)
  {
    return snapshot
  }

  targetItems.splice(insertionIndex, 0, itemId)

  return withContainerItems(sourcePatchedSnapshot, toContainerId, targetItems)
}
