// src/features/library/model/useBoardsLibrary.ts
// reactive subscription for the My Lists library row set

import { useQuery } from 'convex/react'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { api } from '@convex/_generated/api'

export interface BoardsLibraryResult
{
  // null while the auth/query is loading; LibraryBoardListItem[] when ready
  // (empty array is a valid 'loaded but no rows' result, distinct from null)
  rows: LibraryBoardListItem[] | null
  isLoading: boolean
}

export const useBoardsLibrary = (enabled: boolean): BoardsLibraryResult =>
{
  // 'skip' suppresses the convex subscription entirely while signed-out so
  // we don't burn a websocket message just to receive []
  const result = useQuery(
    api.workspace.boards.queries.getMyLibraryBoards,
    enabled ? {} : 'skip'
  )

  if (result === undefined)
  {
    return { rows: null, isLoading: enabled }
  }

  return { rows: result, isLoading: false }
}
