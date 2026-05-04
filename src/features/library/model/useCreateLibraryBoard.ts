// src/features/library/model/useCreateLibraryBoard.ts
// creates a blank local list from the library page & navigates to workspace

import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createBoardSession } from '~/features/workspace/boards/model/boardSession'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'

interface CreateLibraryBoardAction
{
  create: () => void
  isPending: boolean
}

export const useCreateLibraryBoard = (): CreateLibraryBoardAction =>
{
  const navigate = useNavigate()
  const [isPending, setIsPending] = useState(false)
  const pendingRef = useRef(false)
  pendingRef.current = isPending

  const create = useCallback(() =>
  {
    if (pendingRef.current) return
    setIsPending(true)
    void (async () =>
    {
      try
      {
        await createBoardSession()
        toast('Created a blank list', 'success')
        navigate('/')
      }
      catch (error)
      {
        logger.error('library', 'create blank list failed', error)
        toast('Could not create a new list. Please try again.', 'error')
      }
      finally
      {
        setIsPending(false)
      }
    })()
  }, [navigate])

  return { create, isPending }
}
