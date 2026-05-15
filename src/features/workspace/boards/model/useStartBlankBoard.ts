// src/features/workspace/boards/model/useStartBlankBoard.ts
// "+ New board" -> blank session + navigate to workspace. shared between the
// top-nav action & any marketplace CTA that opens a blank board

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { createBoardSession } from './boardSession'

export const useStartBlankBoard = (): (() => void) =>
{
  const navigate = useNavigate()
  return useCallback(() =>
  {
    void createBoardSession()
    navigate('/')
  }, [navigate])
}
