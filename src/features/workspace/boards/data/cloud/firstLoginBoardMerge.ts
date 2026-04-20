// src/features/workspace/boards/data/cloud/firstLoginBoardMerge.ts
// first-login board merge: push-all-local & decide/pull-cloud paths + helper

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
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

// push all local boards to the cloud (first-login, cloud-empty case)
export const pushAllLocalBoards = async (
  userId: string,
  shouldProceed?: () => boolean
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

      const { snapshot, syncState } = readBoardStateForCloudSync(meta.id)

      const boardExternalId = syncState.cloudBoardExternalId ?? meta.id
      const outcome = await flushBoardToCloud(
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

        persistBoardSyncState(
          meta.id,
          markBoardSynced(outcome.revision, boardExternalId)
        )
        return { boardId: meta.id, synced: true, aborted: false }
      }

      if (outcome.kind === 'error')
      {
        console.warn(`Board sync failed for ${meta.id}:`, outcome.error)
      }
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
    toast(
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
  shouldProceed: () => boolean
): Promise<void> =>
{
  if (hasCompletedCloudPull(userId) || !shouldProceed()) return

  try
  {
    const cloudBoards = await listMyBoardsImperative()
    if (!shouldProceed()) return

    const localBoards = useWorkspaceBoardRegistryStore.getState().boards
    const decision = decideFirstLoginMerge(cloudBoards, localBoards, userId)

    switch (decision.action)
    {
      case 'push-local':
      {
        const result = await pushAllLocalBoards(userId, shouldProceed)
        if (!result.aborted && result.failedBoardIds.length === 0)
        {
          markCloudPullCompleted(userId)
        }
        break
      }
      case 'pull-cloud':
      case 'resume-pull-cloud':
      {
        try
        {
          markCloudPullPending(userId)

          const result = await pullAllCloudBoards({
            cloudBoards,
            mode:
              decision.action === 'pull-cloud' ? 'replace' : 'merge-missing',
            shouldProceed,
          })
          if (result.kind === 'aborted' || !shouldProceed())
          {
            return
          }

          if (result.failedCount > 0 && result.pulledCount === 0)
          {
            toast('Failed to load cloud boards. Please try again.', 'error')
          }
          else
          {
            if (result.failedCount === 0)
            {
              markCloudPullCompleted(userId)
            }

            if (result.attemptedCount === 0)
            {
              break
            }

            toast(
              result.failedCount > 0
                ? `Loaded ${result.pulledCount} of ${result.attemptedCount} ${pluralizeWord(result.attemptedCount, 'board')}. Missing boards will be retried next sign-in.`
                : `Loaded ${result.pulledCount} ${pluralizeWord(result.pulledCount, 'board')} from the cloud.`,
              result.failedCount > 0 ? 'info' : 'success'
            )
          }
        }
        catch (error)
        {
          console.warn('Cloud pull failed:', error)
          if (shouldProceed())
          {
            toast('Failed to load cloud boards. Please try again.', 'error')
          }
        }
        break
      }
      case 'conflict':
        toast(
          'Signed in. Your local and cloud boards are kept separately for now.',
          'info'
        )
        markCloudPullCompleted(userId)
        break
      case 'skip':
        markCloudPullCompleted(userId)
        break
    }
  }
  catch (error)
  {
    console.warn('First-login merge failed:', error)
  }
}
