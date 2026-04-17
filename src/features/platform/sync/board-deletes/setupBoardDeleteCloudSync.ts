// src/features/platform/sync/board-deletes/setupBoardDeleteCloudSync.ts
// board-delete cloud-sync drainer — sidecar is the durable queue, deletes are
// one-shot. triggerDrain coalesces concurrent calls; dispose awaits in-flight

import {
  clearPendingBoardDelete,
  loadBoardDeleteSyncMeta,
} from '~/features/workspace/boards/data/local/boardDeleteSyncMeta'
import { deleteBoardImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { mapAsyncLimitSettled } from '~/shared/lib/asyncMapLimit'
import { isPermanentConvexError } from '../lib/convexErrorCode'
import { useSyncStatusStore } from '../status/syncStatusStore'

// parallel delete concurrency — independent rows on the server, but we
// bound to 4 so a user w/ dozens of queued deletes doesn't fan out a
// thundering herd on the first online tick
const DELETE_CONCURRENCY = 4

interface SetupBoardDeleteCloudSyncOptions
{
  shouldProceed?: () => boolean
  onError?: (cloudExternalId: string, error: unknown) => void
}

export interface BoardDeleteCloudSyncHandle
{
  // fire & forget request to drain the sidecar. coalesces concurrent
  // triggers into the next pass instead of running multiple drains in
  // parallel, which would race over the sidecar's read-modify-write cycle
  triggerDrain: () => void
  // awaits any in-flight drain so the caller can safely clear the sidecar
  // after dispose returns
  dispose: () => Promise<void>
}

export const setupBoardDeleteCloudSync = (
  options: SetupBoardDeleteCloudSyncOptions = {}
): BoardDeleteCloudSyncHandle =>
{
  let inFlight: Promise<void> | null = null
  // set when a drain is already running & a new trigger arrives — causes the
  // current drain to re-run immediately after finishing to avoid orphaning
  let rerunRequested = false
  let disposed = false

  const canProceed = (): boolean =>
    options.shouldProceed ? options.shouldProceed() : true

  const drainOnce = async (): Promise<void> =>
  {
    while (!disposed && canProceed())
    {
      const meta = loadBoardDeleteSyncMeta()
      if (meta.pendingExternalIds.length === 0) return

      if (!useSyncStatusStore.getState().online) return

      const ids = meta.pendingExternalIds

      // parallel settled — each delete is independent across rows. a
      // single failure doesn't stop the rest; we aggregate the failure
      // count & bail the outer loop if nothing succeeded so we don't spin
      let progressed = 0
      const results = await mapAsyncLimitSettled(
        ids,
        DELETE_CONCURRENCY,
        async (cloudExternalId) =>
        {
          if (disposed || !canProceed()) throw new Error('aborted')
          if (!useSyncStatusStore.getState().online) throw new Error('offline')
          await deleteBoardImperative({ boardExternalId: cloudExternalId })
          return cloudExternalId
        }
      )

      for (let i = 0; i < results.length; i++)
      {
        if (disposed) return
        const result = results[i]
        const cloudExternalId = ids[i]

        if (result.status === 'fulfilled')
        {
          clearPendingBoardDelete(cloudExternalId)
          progressed++
          continue
        }

        const error = result.reason
        // permanent server-side failure (forbidden = entry belongs to a
        // previous user; not_found = row already cleaned up). dropping
        // the sidecar entry is correct — retry can never succeed
        if (isPermanentConvexError(error))
        {
          clearPendingBoardDelete(cloudExternalId)
          progressed++
          continue
        }

        // transient failure — surface via onError but leave the sidecar
        // entry for the next drain. we still continue iterating remaining
        // results so successes (if any) get cleared
        options.onError?.(cloudExternalId, error)
      }

      // if no id made progress this pass, back off — looping would just
      // re-attempt the same failing entries until the next trigger
      if (progressed === 0) return
    }
  }

  const runDrain = (): Promise<void> =>
  {
    if (inFlight)
    {
      rerunRequested = true
      return inFlight
    }

    inFlight = (async () =>
    {
      try
      {
        do
        {
          rerunRequested = false
          await drainOnce()
        } while (rerunRequested && !disposed && canProceed())
      }
      finally
      {
        inFlight = null
      }
    })()

    return inFlight
  }

  return {
    triggerDrain: () =>
    {
      // fire & forget — drain runs in background while UI proceeds.
      // swallow rejections; errors are already routed through onError
      void runDrain().catch(() =>
      {
        /* errors already routed through onError in drainOnce */
      })
    },
    dispose: async () =>
    {
      disposed = true
      if (inFlight)
      {
        try
        {
          await inFlight
        }
        catch
        {
          /* errors already routed through onError */
        }
      }
    },
  }
}
