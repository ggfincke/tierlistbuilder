// src/features/workspace/boards/model/useStartBlankBoard.ts
// "+ New board" -> blank session + navigate to workspace. shared by top-nav,
// marketplace gallery CTA, & library tile

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { logger } from '~/shared/lib/logger'
import { createBoardSession } from './boardSession'

interface StartBlankBoardAction
{
  start: () => void
}

export const useStartBlankBoard = (): StartBlankBoardAction =>
{
  const navigate = useNavigate()

  const start = useCallback(() =>
  {
    createBoardSession()
      .then(() =>
      {
        navigate('/')
      })
      .catch((error: unknown) =>
      {
        logger.error('boards', 'create blank board failed', error)
      })
  }, [navigate])

  return { start }
}
