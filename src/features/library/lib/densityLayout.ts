// src/features/library/lib/densityLayout.ts
// shared grid & cover sizing for board-library density modes

import type { LibraryBoardDensity } from '@tierlistbuilder/contracts/workspace/board'

export const LIBRARY_COVER_HEIGHT_BY_DENSITY: Record<
  LibraryBoardDensity,
  string
> = {
  dense: 'h-36',
  default: 'h-44',
  loose: 'h-56',
}

export const LIBRARY_GRID_COLUMNS_BY_DENSITY: Record<
  LibraryBoardDensity,
  number
> = {
  dense: 4,
  default: 3,
  loose: 2,
}
