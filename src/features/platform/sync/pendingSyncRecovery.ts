// src/features/platform/sync/pendingSyncRecovery.ts
// resume sync work for boards w/ a non-null pendingSyncAt marker. called
// after first-login merge resolves & on offline -> online transitions.
// reads each registered board's persisted BoardSyncState from localStorage,
// queues a fresh PendingBoardSync for any board that still has unflushed
// local edits.
//
// safe to call repeatedly: the scheduler dedupes by board (queue() replaces
// any pending work for the same boardId), & the persisted pendingSyncAt is
// cleared in the scheduler's synced branch — so a board that's already
// up-to-date is a no-op

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { selectBoardDataFields } from '~/features/workspace/boards/model/boardSnapshot'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { readBoardStateForCloudSync } from './cloudFlush'
import type { PendingBoardSync } from './cloudSyncScheduler'

interface ResumePendingSyncsOptions
{
  // hand the scheduler's queue method here. helper takes a callback rather
  // than the scheduler directly to keep the dependency direction one-way:
  // useCloudSync owns the scheduler & forwards queue, this helper stays
  // ignorant of scheduler internals
  queueWork: (work: PendingBoardSync) => void
  // optional auth/online gate matching the scheduler's shouldProceed
  // semantics. if it returns false, the helper bails before queueing
  shouldProceed?: () => boolean
}

export interface ResumePendingSyncsResult
{
  resumedBoardIds: BoardId[]
}

export const resumePendingSyncs = (
  options: ResumePendingSyncsOptions
): ResumePendingSyncsResult =>
{
  const { queueWork, shouldProceed } = options
  const canProceed = (): boolean => (shouldProceed ? shouldProceed() : true)

  if (!canProceed())
  {
    return { resumedBoardIds: [] }
  }

  const boards = useWorkspaceBoardRegistryStore.getState().boards
  const resumedBoardIds: BoardId[] = []

  for (const meta of boards)
  {
    if (!canProceed())
    {
      break
    }

    const { snapshot, syncState } = readBoardStateForCloudSync(meta.id)

    if (syncState.pendingSyncAt === null)
    {
      continue
    }

    queueWork({
      boardId: meta.id,
      snapshot,
      // selectBoardDataFields takes any object w/ the 5 BoardSnapshot data
      // keys — a snapshot satisfies that shape directly
      boardDataSelection: selectBoardDataFields(snapshot),
      syncState,
    })

    resumedBoardIds.push(meta.id)
  }

  return { resumedBoardIds }
}
