// src/features/library/lib/sortAndFilter.ts
// pure helpers for the My Boards publish-state filter & sort options

import {
  PUBLISH_STATES,
  computeLibraryBoardProgress,
  type LibraryBoardFilter,
  type LibraryBoardListItem,
  type LibraryBoardSort,
} from '@tierlistbuilder/contracts/workspace/libraryBoard'

// every publish state has a visible filter chip — the rail is All + these
export const VISIBLE_LIBRARY_BOARD_FILTERS = PUBLISH_STATES

export const filterLibraryBoards = (
  rows: readonly LibraryBoardListItem[],
  filter: LibraryBoardFilter
): readonly LibraryBoardListItem[] =>
{
  if (filter === 'all') return rows
  return rows.filter((row) => row.publishState === filter)
}

// sort comparator factory — pinned-first is applied unconditionally before
// the chosen sort key (pinning UI is forward-compat; field always present)
export const sortLibraryBoards = (
  rows: readonly LibraryBoardListItem[],
  sort: LibraryBoardSort
): LibraryBoardListItem[] =>
{
  const out = rows.slice()
  out.sort((a, b) =>
  {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    switch (sort)
    {
      case 'created':
        return b.createdAt - a.createdAt
      case 'title':
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: 'base',
        })
      case 'progress':
      {
        const ap = computeLibraryBoardProgress(a)
        const bp = computeLibraryBoardProgress(b)
        if (ap !== bp) return bp - ap
        // tiebreak on updatedAt so equally-progressed boards still feel fresh
        return b.updatedAt - a.updatedAt
      }
      case 'updated':
      default:
        return b.updatedAt - a.updatedAt
    }
  })
  return out
}

export interface LibraryPublishCounts
{
  all: number
  draft: number
  wip: number
  live: number
}

export const countLibraryPublishStates = (
  rows: readonly LibraryBoardListItem[]
): LibraryPublishCounts =>
{
  const counts: LibraryPublishCounts = {
    all: rows.length,
    draft: 0,
    wip: 0,
    live: 0,
  }
  for (const row of rows)
  {
    counts[row.publishState] += 1
  }
  return counts
}
