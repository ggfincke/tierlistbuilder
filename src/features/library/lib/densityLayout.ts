// src/features/library/lib/densityLayout.ts
// grid & cover sizing for board-library density modes — `default` mirrors the
// /templates browse grid so My Boards & the gallery render matching cards

import type { LibraryBoardDensity } from '@tierlistbuilder/contracts/workspace/board'

export const LIBRARY_COVER_HEIGHT_BY_DENSITY: Record<
  LibraryBoardDensity,
  string
> = {
  dense: 'h-36',
  default: 'h-40',
  loose: 'h-56',
}

// responsive column classes per density. `default` is the exact /templates
// browse grid (sm:2 lg:3 xl:4); dense/loose step one denser/sparser
export const LIBRARY_GRID_CLASS_BY_DENSITY: Record<
  LibraryBoardDensity,
  string
> = {
  dense: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  default: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  loose: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3',
}

// representative (widest-breakpoint) column count — drives skeleton row sizing
export const LIBRARY_GRID_COLUMNS_BY_DENSITY: Record<
  LibraryBoardDensity,
  number
> = {
  dense: 5,
  default: 4,
  loose: 3,
}
