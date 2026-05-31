// src/features/library/model/useBoardsLibrary.ts
// cloud library noop for the extracted UI shell

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

interface BoardsLibraryResult
{
  rows: LibraryBoardListItem[] | null
  isLoading: boolean
}

export const useBoardsLibrary = (_enabled: boolean): BoardsLibraryResult => ({
  rows: null,
  isLoading: false,
})
