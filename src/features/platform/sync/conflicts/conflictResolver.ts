// src/features/platform/sync/conflicts/conflictResolver.ts
// three resolution branches for upsertBoardState conflicts: keep-local
// (overwrite cloud), keep-cloud (overwrite local), keep-both (duplicate + keep-cloud)

import type {
  BoardMeta,
  BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  generateBoardId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import {
  loadBoardIntoSession,
  persistBoardSyncState,
  renameBoardSession,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import {
  flushBoardToCloud,
  readBoardStateForCloudSync,
} from '../boards/cloudFlush'
import { useConflictQueueStore } from './useConflictQueueStore'
import { toast } from '~/shared/notifications/useToastStore'
import { formatError } from '~/shared/lib/errors'

const KEEP_BOTH_SUFFIX = '(this device)'

export interface ResolveContext
{
  boardId: BoardId
  serverState: CloudBoardState
  userId: string
}

export type ResolveOutcome = { ok: true } | { ok: false; error: string }

// keep local — re-push the current local snapshot w/ baseRevision matching
// the server's current revision (force-overwrite cloud)
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
    persistBoardSyncState(boardId, {
      lastSyncedRevision: outcome.revision,
      cloudBoardExternalId: boardExternalId,
      pendingSyncAt: null,
    })
    return { ok: true }
  }

  if (outcome.kind === 'conflict')
  {
    // race — another device wrote between our resolution attempts. requeue
    // w/ the new serverState so the modal re-opens for a fresh decision
    useConflictQueueStore.getState().enqueue(boardId, outcome.serverState)
    return { ok: false, error: 'Cloud changed again — please resolve again.' }
  }

  return { ok: false, error: formatError(outcome.error) }
}

// keep cloud — discard local edits, materialize server state into local
// storage (& into the active store if this is the active board)
export const resolveKeepCloud = async (
  ctx: Omit<ResolveContext, 'userId'>
): Promise<ResolveOutcome> =>
{
  const { boardId, serverState } = ctx
  const cloudSnapshot = serverStateToSnapshot(serverState)
  const cloudBoardExternalId = boardId

  const saveResult = saveBoardToStorage(boardId, cloudSnapshot, {
    syncState: {
      lastSyncedRevision: serverState.revision,
      cloudBoardExternalId,
      pendingSyncAt: null,
    },
  })
  if (!saveResult.ok)
  {
    return { ok: false, error: saveResult.message }
  }

  const isActive =
    useWorkspaceBoardRegistryStore.getState().activeBoardId === boardId
  if (isActive)
  {
    // reload from storage to refresh the active store w/ the cloud snapshot.
    // loadBoardIntoSession suppresses the next local autosave so this
    // doesn't race against what we just wrote
    await loadBoardIntoSession(boardId)
  }

  renameBoardSession(boardId, cloudSnapshot.title)

  return { ok: true }
}

// keep both — duplicate the current local snapshot as a brand new board w/
// the "(this device)" suffix, push it as a new cloud row, then keep-cloud
// for the original
export const resolveKeepBoth = async (
  ctx: ResolveContext
): Promise<ResolveOutcome> =>
{
  // capture local before keep-cloud overwrites it
  const { snapshot: localSnapshot } = readBoardStateForCloudSync(ctx.boardId)
  const duplicateId = generateBoardId()
  const duplicateTitle = `${localSnapshot.title} ${KEEP_BOTH_SUFFIX}`
  const duplicateSnapshot: BoardSnapshot = {
    ...localSnapshot,
    title: duplicateTitle,
  }

  // stamp the duplicate w/ a pending marker BEFORE the cloud push. if the
  // push fails, pendingSyncRecovery picks this board up on the next online
  // transition; w/o the marker, the duplicate would only sync after the
  // user's next edit (silent desync until then)
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
    persistBoardSyncState(duplicateId, {
      lastSyncedRevision: pushOutcome.revision,
      cloudBoardExternalId: duplicateId,
      pendingSyncAt: null,
    })
    duplicateSyncedToCloud = true
  }
  // conflict on a brand new board is impossible (baseRevision=null skips
  // the OCC check) & the error branch is handled by the consolidated toast
  // below so we don't double-toast the user

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
