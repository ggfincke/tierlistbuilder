// src/features/workspace/boards/model/useStartBlankBoard.ts
// "+ New board" -> blank session + navigate to workspace. shared by top-nav,
// marketplace gallery CTA, & library tile. Library opts in to toast feedback

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { createBoardSession } from '~/features/workspace/boards/model/boardSession'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface StartBlankBoardOptions
{
  withToast?: boolean
}

interface StartBlankBoardAction
{
  start: () => void
  isPending: boolean
}

export const useStartBlankBoard = (
  options: StartBlankBoardOptions = {}
): StartBlankBoardAction =>
{
  const { withToast = false } = options
  const navigate = useNavigate()

  const startBoard = useCallback(async (): Promise<void> =>
  {
    await createBoardSession()
    if (withToast)
    {
      toast('Created a blank board', 'success')
    }
    navigate('/')
  }, [navigate, withToast])

  const onError = useCallback(
    (error: unknown) =>
    {
      logger.error('boards', 'create blank board failed', error)
      if (withToast)
      {
        toast('Could not create a new board. Please try again.', 'error')
      }
    },
    [withToast]
  )

  const { run: runStart, isPending } = useAsyncAction<[], void>(startBoard, {
    onError,
  })

  const start = useCallback(() =>
  {
    void runStart()
  }, [runStart])

  return { start, isPending }
}
