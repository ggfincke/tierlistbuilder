// src/features/workspace/boards/data/cloud/firstLoginBoardMerge.ts
// first-login board merge: push-all-local & decide/pull-cloud paths + helper

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  markBoardPendingSync,
  markBoardSynced,
} from '~/features/workspace/boards/model/sync'
import { listMyBoardsImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { pullAllCloudBoards } from '~/features/workspace/boards/data/cloud/cloudPull'
import {
  decideFirstLoginMerge,
  markCloudPullCompleted,
  hasCompletedCloudPull,
  markCloudPullPending,
} from '~/features/workspace/boards/data/cloud/cloudMerge'
import {
  flushBoardToCloud,
  readBoardStateForCloudSync,
} from '~/features/workspace/boards/data/cloud/cloudFlush'
import { persistBoardSyncState } from '~/features/workspace/boards/data/local/localBoardSession'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'
import { toast } from '~/shared/notifications/useToastStore'
import { pluralizeWord } from '~/shared/lib/pluralize'
import { SYNC_CONCURRENCY } from '~/features/platform/sync/lib/concurrency'
import { logger } from '~/shared/lib/logger'

export interface FirstLoginBoardMergeDeps
{
  listMyBoards: () => Promise<BoardListItem[]>
  pullAllCloudBoards: typeof pullAllCloudBoards
  decideFirstLoginMerge: typeof decideFirstLoginMerge
  hasCompletedCloudPull: typeof hasCompletedCloudPull
  markCloudPullCompleted: typeof markCloudPullCompleted
  markCloudPullPending: typeof markCloudPullPending
  flushBoardToCloud: typeof flushBoardToCloud
  readBoardStateForCloudSync: typeof readBoardStateForCloudSync
  persistBoardSyncState: typeof persistBoardSyncState
  notify: typeof toast
  loggerWarn: typeof logger.warn
  now: () => number
}

const DEFAULT_FIRST_LOGIN_BOARD_MERGE_DEPS: FirstLoginBoardMergeDeps = {
  listMyBoards: listMyBoardsImperative,
  pullAllCloudBoards,
  decideFirstLoginMerge,
  hasCompletedCloudPull,
  markCloudPullCompleted,
  markCloudPullPending,
  flushBoardToCloud,
  readBoardStateForCloudSync,
  persistBoardSyncState,
  notify: toast,
  loggerWarn: logger.warn,
  now: () => Date.now(),
}

// push all local boards to the cloud (first-login, cloud-empty case)
export const pushAllLocalBoards = async (
  userId: string,
  shouldProceed?: () => boolean,
  deps: FirstLoginBoardMergeDeps = DEFAULT_FIRST_LOGIN_BOARD_MERGE_DEPS
): Promise<{
  failedBoardIds: BoardId[]
  aborted: boolean
}> =>
{
  const boards = [...useWorkspaceBoardRegistryStore.getState().boards]

  const canProceed = makeProceedGuard(shouldProceed)

  const results = await mapAsyncLimit(
    boards,
    SYNC_CONCURRENCY.firstLoginBoard,
    async (meta) =>
    {
      if (!canProceed())
      {
        return { boardId: meta.id, synced: false, aborted: true }
      }

      const { snapshot, syncState } = deps.readBoardStateForCloudSync(meta.id)

      const boardExternalId = syncState.cloudBoardExternalId ?? meta.id
      const outcome = await deps.flushBoardToCloud(
        snapshot,
        boardExternalId,
        syncState.lastSyncedRevision,
        userId
      )

      if (outcome.kind === 'synced')
      {
        if (!canProceed())
        {
          return { boardId: meta.id, synced: false, aborted: true }
        }

        deps.persistBoardSyncState(
          meta.id,
          markBoardSynced(outcome.revision, boardExternalId)
        )
        return { boardId: meta.id, synced: true, aborted: false }
      }

      if (outcome.kind === 'error')
      {
        deps.loggerWarn(
          'sync',
          `Board sync failed for ${meta.id}:`,
          outcome.error
        )
      }

      deps.persistBoardSyncState(
        meta.id,
        markBoardPendingSync(syncState, deps.now())
      )

      return { boardId: meta.id, synced: false, aborted: false }
    }
  )

  if (!canProceed() || results.some((result) => result.aborted))
  {
    return { failedBoardIds: [], aborted: true }
  }

  const failedBoardIds = results
    .filter((result) => !result.synced)
    .map((result) => result.boardId)

  if (failedBoardIds.length > 0)
  {
    deps.notify(
      `${failedBoardIds.length} ${pluralizeWord(failedBoardIds.length, 'board')} failed to sync. They will be retried next sign-in.`,
      'error'
    )
  }

  return { failedBoardIds, aborted: false }
}

// run the first-login merge flow for boards (settings & preset merges
// run separately after this resolves so the board path can keep its
// modal-driven UX without dragging cosmetic prefs into the same flow)
export const runFirstLoginBoardMerge = async (
  userId: string,
  shouldProceed: () => boolean,
  deps: FirstLoginBoardMergeDeps = DEFAULT_FIRST_LOGIN_BOARD_MERGE_DEPS
): Promise<void> =>
{
  if (deps.hasCompletedCloudPull(userId) || !shouldProceed()) return

  try
  {
    const cloudBoards = await deps.listMyBoards()
    if (!shouldProceed()) return

    const localBoards = useWorkspaceBoardRegistryStore.getState().boards
    const decision = deps.decideFirstLoginMerge(
      cloudBoards,
      localBoards,
      userId
    )

    switch (decision.action)
    {
      case 'push-local':
      {
        const result = await pushAllLocalBoards(userId, shouldProceed, deps)
        if (!result.aborted && result.failedBoardIds.length === 0)
        {
          deps.markCloudPullCompleted(userId)
        }
        break
      }
      case 'pull-cloud':
      case 'resume-pull-cloud':
      {
        try
        {
          deps.markCloudPullPending(userId)

          const result = await deps.pullAllCloudBoards({
            cloudBoards,
            mode:
              decision.action === 'pull-cloud' ? 'replace' : 'merge-missing',
            shouldProceed,
          })
          if (result.kind === 'aborted' || !shouldProceed())
          {
            return
          }

          if (result.attemptedCount === 0)
          {
            deps.markCloudPullCompleted(userId)
            break
          }

          if (result.failedCount > 0 && result.pulledCount === 0)
          {
            deps.notify(
              'Failed to load cloud boards. Please try again.',
              'error'
            )
          }
          else
          {
            if (result.failedCount === 0)
            {
              deps.markCloudPullCompleted(userId)
            }

            deps.notify(
              result.failedCount > 0
                ? `Loaded ${result.pulledCount} of ${result.attemptedCount} ${pluralizeWord(result.attemptedCount, 'board')}. Missing boards will be retried next sign-in.`
                : `Loaded ${result.pulledCount} ${pluralizeWord(result.pulledCount, 'board')} from the cloud.`,
              result.failedCount > 0 ? 'info' : 'success'
            )
          }
        }
        catch (error)
        {
          deps.loggerWarn('sync', 'Cloud pull failed:', error)
          if (shouldProceed())
          {
            deps.notify(
              'Failed to load cloud boards. Please try again.',
              'error'
            )
          }
        }
        break
      }
      case 'conflict':
        deps.notify(
          'Signed in. Your local and cloud boards are kept separately for now.',
          'info'
        )
        deps.markCloudPullCompleted(userId)
        break
      case 'skip':
        deps.markCloudPullCompleted(userId)
        break
    }
  }
  catch (error)
  {
    deps.loggerWarn('sync', 'First-login merge failed:', error)
  }
}
