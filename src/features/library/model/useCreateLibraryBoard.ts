// src/features/library/model/useCreateLibraryBoard.ts
// creates a blank local list from the library page & navigates to workspace

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { createBoardSession } from '~/features/workspace/boards/model/boardSession'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface CreateLibraryBoardAction
{
  create: () => void
  isPending: boolean
}

export const useCreateLibraryBoard = (): CreateLibraryBoardAction =>
{
  const navigate = useNavigate()

  const createBoard = useCallback(async (): Promise<void> =>
  {
    await createBoardSession()
    toast('Created a blank list', 'success')
    navigate('/')
  }, [navigate])

  const onError = useCallback((error: unknown) =>
  {
    logger.error('library', 'create blank list failed', error)
    toast('Could not create a new list. Please try again.', 'error')
  }, [])

  const { run: runCreate, isPending } = useAsyncAction<[], void>(createBoard, {
    onError,
  })

  const create = useCallback(() =>
  {
    void runCreate()
  }, [runCreate])

  return { create, isPending }
}
