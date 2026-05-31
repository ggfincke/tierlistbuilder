// src/features/library/lib/densityLayout.ts
// grid & cover sizing for board-library density modes — `default` mirrors the
// /templates browse grid so My Boards & the gallery render matching cards

import type { LibraryBoardDensity } from '@tierlistbuilder/contracts/workspace/board'

// cover aspect ratio per density — width-driven so covers scale w/ the card
export const LIBRARY_COVER_ASPECT_BY_DENSITY: Record<
  LibraryBoardDensity,
  string
> = {
  dense: 'aspect-[16/9]',
  default: 'aspect-[16/9]',
  loose: 'aspect-[16/9]',
}

// responsive column classes per density. `default` caps at xl:3 so wide-screen
// cards run a tad bigger; dense/loose step one denser/sparser
export const LIBRARY_GRID_CLASS_BY_DENSITY: Record<
  LibraryBoardDensity,
  string
> = {
  dense: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  default: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3',
  loose: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3',
}

// representative (widest-breakpoint) column count — drives skeleton row sizing
export const LIBRARY_GRID_COLUMNS_BY_DENSITY: Record<
  LibraryBoardDensity,
  number
> = {
  dense: 5,
  default: 3,
  loose: 3,
}
