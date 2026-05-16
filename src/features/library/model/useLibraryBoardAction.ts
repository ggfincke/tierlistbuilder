// src/features/library/model/useLibraryBoardAction.ts
// per-board action runner shared by library mutation hooks — tracks the
// in-flight externalId, dedups overlapping calls, & toasts on error

import { useCallback, useRef, useState } from 'react'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'

interface RunOptions
{
  errorMessage: string
  logTag: string
}

interface LibraryBoardActionState
{
  run: <T>(
    externalId: BoardId,
    options: RunOptions,
    action: () => Promise<T>
  ) => Promise<T | null>
  pendingExternalId: BoardId | null
}

export const useLibraryBoardAction = (): LibraryBoardActionState =>
{
  const [pendingExternalId, setPendingExternalId] = useState<BoardId | null>(
    null
  )
  // tracks every in-flight board so back-to-back actions on different boards
  // don't have the earlier finish() prematurely clear a later board's pending
  // state. pendingExternalId mirrors the latest-started id (or null when none)
  const inflightRef = useRef<Set<BoardId>>(new Set())

  const run = useCallback(
    async <T>(
      externalId: BoardId,
      options: RunOptions,
      action: () => Promise<T>
    ): Promise<T | null> =>
    {
      if (inflightRef.current.has(externalId)) return null

      inflightRef.current.add(externalId)
      setPendingExternalId(externalId)

      try
      {
        return await action()
      }
      catch (error)
      {
        logger.warn('library', options.logTag, error)
        toast(options.errorMessage, 'error')
        return null
      }
      finally
      {
        inflightRef.current.delete(externalId)
        setPendingExternalId((current) =>
          current === externalId ? null : current
        )
      }
    },
    []
  )

  return { run, pendingExternalId }
}
