// src/features/marketplace/ui/publish/publishBoardSelection.ts
// source-board selection helpers for the publish modal

import type { PublishableBoard } from '~/features/workspace/boards/model/usePublishableBoards'

export type PublishBoardSelection =
  | { kind: 'default' }
  | { kind: 'explicit'; boardExternalId: string }

interface InitialPublishBoardSelectionInput
{
  isEdit: boolean
  initialBoardExternalId?: string | null
}

export const createInitialPublishBoardSelection = ({
  isEdit,
  initialBoardExternalId,
}: InitialPublishBoardSelectionInput): PublishBoardSelection =>
{
  if (isEdit || !initialBoardExternalId) return { kind: 'default' }
  return { kind: 'explicit', boardExternalId: initialBoardExternalId }
}

export const resolveSelectedPublishBoard = (
  boards: readonly PublishableBoard[],
  selection: PublishBoardSelection
): PublishableBoard | null =>
{
  if (selection.kind === 'default') return boards[0] ?? null
  return (
    boards.find(
      (board) => board.boardExternalId === selection.boardExternalId
    ) ?? null
  )
}
