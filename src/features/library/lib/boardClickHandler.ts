// src/features/library/lib/boardClickHandler.ts
// shared open-action binding for library board rows & cards

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

type OpenBoardHandler = (board: LibraryBoardListItem) => void

interface BoardClickBinding
{
  disabled: boolean
  onClick: () => void
}

export const makeBoardClickHandler = (
  onOpen: OpenBoardHandler | undefined,
  isPending: boolean | undefined,
  board: LibraryBoardListItem
): BoardClickBinding =>
{
  const disabled = !onOpen || Boolean(isPending)

  return {
    disabled,
    onClick: () =>
    {
      if (disabled || !onOpen) return
      onOpen(board)
    },
  }
}
