// src/features/library/model/useLibraryBoardAction.ts
// per-board action runner shared by library mutation hooks — tracks the
// in-flight externalId, dedups overlapping calls, & toasts on error

import { useCallback } from 'react'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { usePerKeyAsyncAction } from '~/shared/hooks/usePerKeyAsyncAction'

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
  const handleError = useCallback(
    (error: unknown, _externalId: BoardId, options: RunOptions) =>
    {
      logger.warn('library', options.logTag, error)
      toast(options.errorMessage, 'error')
    },
    []
  )
  const { run: runPerBoardAction, pendingKey } = usePerKeyAsyncAction<BoardId>()

  const run = useCallback(
    async <T>(
      externalId: BoardId,
      options: RunOptions,
      action: () => Promise<T>
    ): Promise<T | null> =>
    {
      return await runPerBoardAction(externalId, async () =>
      {
        try
        {
          return await action()
        }
        catch (error)
        {
          handleError(error, externalId, options)
          throw error
        }
      })
    },
    [handleError, runPerBoardAction]
  )

  return { run, pendingExternalId: pendingKey }
}
