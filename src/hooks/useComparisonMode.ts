// src/hooks/useComparisonMode.ts
// comparison mode hook — manages dual-board loading for side-by-side view

import { useMemo, useState } from 'react'

import type { BoardId, TierListData } from '../types'
import { extractBoardData } from '../domain/boardData'
import { loadPersistedBoard } from '../services/boardSession'
import { useBoardManagerStore } from '../store/useBoardManagerStore'
import { useTierListStore } from '../store/useTierListStore'

// load board data either from the active store or from storage
const loadBoard = (boardId: BoardId): TierListData =>
{
  const { activeBoardId } = useBoardManagerStore.getState()
  if (boardId === activeBoardId)
  {
    return extractBoardData(useTierListStore.getState())
  }
  return loadPersistedBoard(boardId)
}

// derive default board IDs for comparison
const getDefaultIds = (
  boards: { id: BoardId }[],
  activeBoardId: BoardId | ''
) =>
{
  if (boards.length < 2)
    return { leftId: '' as BoardId, rightId: '' as BoardId }
  const leftId = activeBoardId || boards[0].id
  const rightId = boards.find((b) => b.id !== leftId)?.id || boards[0].id
  return { leftId, rightId }
}

export const useComparisonMode = (open: boolean) =>
{
  const boards = useBoardManagerStore((s) => s.boards)
  const activeBoardId = useBoardManagerStore((s) => s.activeBoardId)
  const defaults = getDefaultIds(boards, activeBoardId)

  const [leftId, setLeftId] = useState<BoardId | ''>(defaults.leftId)
  const [rightId, setRightId] = useState<BoardId | ''>(defaults.rightId)

  // use state values if set, otherwise fall back to defaults
  const activeLeftId = leftId || defaults.leftId
  const activeRightId = rightId || defaults.rightId

  const leftData = useMemo(
    () => (open && activeLeftId ? loadBoard(activeLeftId as BoardId) : null),
    [open, activeLeftId]
  )
  const rightData = useMemo(
    () => (open && activeRightId ? loadBoard(activeRightId as BoardId) : null),
    [open, activeRightId]
  )

  return {
    boards,
    leftId: activeLeftId,
    rightId: activeRightId,
    leftData,
    rightData,
    setLeftBoard: setLeftId,
    setRightBoard: setRightId,
  }
}
