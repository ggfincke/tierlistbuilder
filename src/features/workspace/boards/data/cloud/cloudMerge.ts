// src/features/workspace/boards/data/cloud/cloudMerge.ts
// first-login merge logic; decides how to handle local vs cloud boards

import type { BoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import {
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '~/shared/lib/browserStorage'
import { readBoardStateForCloudSync } from './cloudFlush'

const CLOUD_PULL_KEY_PREFIX = 'tierlistbuilder-cloud-pull-'
const CLOUD_PULL_STATE_COMPLETED = 'completed'
const CLOUD_PULL_STATE_PENDING = 'pending'

const getCloudPullKey = (userId: string): string =>
  `${CLOUD_PULL_KEY_PREFIX}${userId}`

export const hasCompletedCloudPull = (userId: string): boolean =>
  readBrowserStorageItem(getCloudPullKey(userId)) === CLOUD_PULL_STATE_COMPLETED

export const hasPendingCloudPull = (userId: string): boolean =>
  readBrowserStorageItem(getCloudPullKey(userId)) === CLOUD_PULL_STATE_PENDING

export const markCloudPullCompleted = (userId: string): void =>
  writeBrowserStorageItem(getCloudPullKey(userId), CLOUD_PULL_STATE_COMPLETED)

export const markCloudPullPending = (userId: string): void =>
  writeBrowserStorageItem(getCloudPullKey(userId), CLOUD_PULL_STATE_PENDING)

export type MergeDecision =
  | { action: 'push-local' }
  | { action: 'pull-cloud' }
  | { action: 'resume-pull-cloud' }
  | { action: 'skip' }
  | { action: 'conflict' }

// check if local state is just the default empty board (any preset, no items)
const isDefaultLocalState = (boards: BoardMeta[]): boolean =>
{
  if (boards.length !== 1) return false

  const { snapshot: data } = readBoardStateForCloudSync(boards[0].id)
  const hasItems = Object.keys(data.items ?? {}).length > 0
  const hasDeleted = (data.deletedItems ?? []).length > 0
  const hasUnranked = (data.unrankedItemIds ?? []).length > 0
  const hasTierItems = (data.tiers ?? []).some(
    (tier) => Array.isArray(tier.itemIds) && tier.itemIds.length > 0
  )

  return !hasItems && !hasDeleted && !hasUnranked && !hasTierItems
}

export const decideFirstLoginMerge = (
  cloudBoards: BoardListItem[],
  localBoards: BoardMeta[],
  userId: string
): MergeDecision =>
{
  if (hasCompletedCloudPull(userId))
  {
    return { action: 'skip' }
  }

  if (hasPendingCloudPull(userId))
  {
    return cloudBoards.length === 0
      ? { action: 'skip' }
      : { action: 'resume-pull-cloud' }
  }

  const cloudEmpty = cloudBoards.length === 0
  const localIsDefault = isDefaultLocalState(localBoards)

  if (cloudEmpty && localIsDefault)
  {
    return { action: 'skip' }
  }

  if (cloudEmpty)
  {
    return { action: 'push-local' }
  }

  if (localIsDefault)
  {
    return { action: 'pull-cloud' }
  }

  return { action: 'conflict' }
}
