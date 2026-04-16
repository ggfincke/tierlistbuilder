// src/features/workspace/boards/lib/containerLabel.ts
// human-readable container label for drag & drop screen-reader announcements

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
