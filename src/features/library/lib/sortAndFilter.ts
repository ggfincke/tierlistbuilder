// src/features/library/lib/sortAndFilter.ts
// pure helpers for the My Lists status filter & sort options

import {
  computeLibraryBoardProgress,
  type LibraryBoardFilter,
  type LibraryBoardListItem,
  type LibraryBoardSort,
} from '@tierlistbuilder/contracts/workspace/board'

export const filterLibraryBoards = (
  rows: readonly LibraryBoardListItem[],
  filter: LibraryBoardFilter
): LibraryBoardListItem[] =>
{
  if (filter === 'all') return rows.slice()
  return rows.filter((row) => row.status === filter)
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

export interface LibraryStatusCounts
{
  all: number
  draft: number
  in_progress: number
  finished: number
  published: number
}

export const countLibraryStatuses = (
  rows: readonly LibraryBoardListItem[]
): LibraryStatusCounts =>
{
  const counts: LibraryStatusCounts = {
    all: rows.length,
    draft: 0,
    in_progress: 0,
    finished: 0,
    published: 0,
  }
  for (const row of rows)
  {
    counts[row.status] += 1
  }
  return counts
}
