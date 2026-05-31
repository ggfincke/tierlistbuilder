// src/features/workspace/boards/lib/containerLabel.ts
// human-readable container label for drag & drop screen-reader announcements

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

import { announce } from '~/shared/a11y/announce'
import { formatCountedWord } from '~/shared/lib/pluralize'
import type { ActiveBoardStore } from '~/features/workspace/boards/model/slices/types'
import {
  findContainer,
  getEffectiveContainerSnapshot,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'

// build a human-readable container label for drop announcements
export const getContainerLabel = (
  containerId: string | null | undefined,
  tiers: { id: string; name: string }[]
): string =>
{
  if (containerId === UNRANKED_CONTAINER_ID) return 'unranked pool'
  return tiers.find((t) => t.id === containerId)?.name ?? 'tier'
}

export const announceItemsDropped = (
  state: ActiveBoardStore,
  droppedItemId: ItemId,
  groupCount: number
): void =>
{
  const label = state.items[droppedItemId]?.label ?? 'item'
  const snapshot = getEffectiveContainerSnapshot(state)
  const containerId = findContainer(snapshot, droppedItemId)
  const dest = getContainerLabel(containerId, state.tiers)
  announce(
    groupCount > 1
      ? `Dropped ${formatCountedWord(groupCount, 'item')} in ${dest}`
      : `Dropped ${label} in ${dest}`
  )
}

export const announceItemsPickedUp = (
  state: ActiveBoardStore,
  pickedItemId: ItemId,
  groupCount: number,
  options: { includeKeyboardInstructions?: boolean } = {}
): void =>
{
  const suffix = options.includeKeyboardInstructions
    ? '. Arrow keys to move, space or Enter to drop.'
    : ''
  const label = state.items[pickedItemId]?.label ?? 'item'
  announce(
    groupCount > 1
      ? `Picked up ${formatCountedWord(groupCount, 'item')}${suffix}`
      : `Picked up ${label}${suffix}`
  )
}

export const announceDragCancelled = (): void =>
{
  announce('Drag cancelled')
}
