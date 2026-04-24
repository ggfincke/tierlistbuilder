// src/features/workspace/boards/model/boardConflictResolution.ts
// model actions for resolving board cloud-sync conflicts

import type {
  BoardMeta,
  BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  generateBoardId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import {
  flushBoardToCloud,
  readBoardStateForCloudSync,
} from '~/features/workspace/boards/data/cloud/cloudFlush'
import {
  loadBoardIntoSession,
  persistBoardSyncState,
  renameBoardSession,
} from '~/features/workspace/boards/model/boardSession'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { toast } from '~/shared/notifications/useToastStore'
import { formatError } from '~/shared/lib/errors'
import { useConflictQueueStore } from './boardConflictQueueStore'

const KEEP_BOTH_SUFFIX = '(this device)'

export interface ResolveContext
{
  boardId: BoardId
  serverState: CloudBoardState
  userId: string
}

export type ResolveOutcome = { ok: true } | { ok: false; error: string }

export const resolveKeepLocal = async (
  ctx: ResolveContext
): Promise<ResolveOutcome> =>
{
  const { boardId, serverState, userId } = ctx
  const { snapshot, syncState } = readBoardStateForCloudSync(boardId)
  const boardExternalId = syncState.cloudBoardExternalId ?? boardId

  const outcome = await flushBoardToCloud(
    snapshot,
    boardExternalId,
    serverState.revision,
    userId
  )

  if (outcome.kind === 'synced')
  {
    persistBoardSyncState(
      boardId,
      markBoardSynced(outcome.revision, boardExternalId)
    )
    return { ok: true }
  }

  if (outcome.kind === 'conflict')
  {
    useConflictQueueStore.getState().enqueue(boardId, outcome.serverState)
    return { ok: false, error: 'Cloud changed again. Please resolve again.' }
  }

  return { ok: false, error: formatError(outcome.error) }
}

export const resolveKeepCloud = async (
  ctx: Omit<ResolveContext, 'userId'>
): Promise<ResolveOutcome> =>
{
  const { boardId, serverState } = ctx
  const cloudSnapshot = serverStateToSnapshot(serverState)
  const cloudBoardExternalId = boardId

  const saveResult = saveBoardToStorage(boardId, cloudSnapshot, {
    syncState: markBoardSynced(serverState.revision, cloudBoardExternalId),
  })
  if (!saveResult.ok)
  {
    return { ok: false, error: saveResult.message }
  }

  const isActive =
    useWorkspaceBoardRegistryStore.getState().activeBoardId === boardId
  if (isActive)
  {
    await loadBoardIntoSession(boardId)
  }

  renameBoardSession(boardId, cloudSnapshot.title)

  return { ok: true }
}

export const resolveKeepBoth = async (
  ctx: ResolveContext
): Promise<ResolveOutcome> =>
{
  const { snapshot: localSnapshot } = readBoardStateForCloudSync(ctx.boardId)
  const duplicateId = generateBoardId()
  const duplicateTitle = `${localSnapshot.title} ${KEEP_BOTH_SUFFIX}`
  const duplicateSnapshot: BoardSnapshot = {
    ...localSnapshot,
    title: duplicateTitle,
  }

  const saveResult = saveBoardToStorage(duplicateId, duplicateSnapshot, {
    syncState: {
      lastSyncedRevision: null,
      cloudBoardExternalId: duplicateId,
      pendingSyncAt: Date.now(),
    },
  })
  if (!saveResult.ok)
  {
    return { ok: false, error: saveResult.message }
  }

  const duplicateMeta: BoardMeta = {
    id: duplicateId,
    title: duplicateTitle,
    createdAt: Date.now(),
  }
  useWorkspaceBoardRegistryStore.getState().addBoardMeta(duplicateMeta, false)

  const pushOutcome = await flushBoardToCloud(
    duplicateSnapshot,
    duplicateId,
    null,
    ctx.userId
  )

  let duplicateSyncedToCloud = false

  if (pushOutcome.kind === 'synced')
  {
    persistBoardSyncState(
      duplicateId,
      markBoardSynced(pushOutcome.revision, duplicateId)
    )
    duplicateSyncedToCloud = true
  }

  const cloudOutcome = await resolveKeepCloud({
    boardId: ctx.boardId,
    serverState: ctx.serverState,
  })

  if (cloudOutcome.ok)
  {
    toast(
      duplicateSyncedToCloud
        ? `Your local edits were saved as "${duplicateTitle}".`
        : `"${duplicateTitle}" was saved locally & will sync after the next successful edit.`,
      duplicateSyncedToCloud ? 'success' : 'info'
    )
  }

  return cloudOutcome
}
