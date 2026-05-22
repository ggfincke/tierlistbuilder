// tests/model/libraryBoardAria.test.ts
// My Boards accessible-name helpers

import { describe, expect, it } from 'vitest'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { getLibraryBoardAriaLabel } from '~/features/library/lib/libraryBoardAria'

const board: LibraryBoardListItem = {
  externalId: 'board-aria-test',
  title: 'Summer rankings',
  createdAt: 1,
  updatedAt: 2,
  revision: 3,
  activeItemCount: 2,
  unrankedItemCount: 1,
  rankedItemCount: 1,
  publishState: 'wip',
  syncState: 'localOnly',
  visibility: 'private',
  category: 'other',
  sourceTemplateSizeClass: null,
  sourceTemplateCoverMedia: null,
  sourceTemplateCoverFraming: null,
  coverItems: [],
  paletteId: 'classic',
  // tierCount is the untruncated total; tierColors stays capped at
  // LIBRARY_BOARD_TIER_LIMIT, so the two diverge for >5-tier boards
  tierCount: 6,
  tierColors: [{ kind: 'palette', index: 0 }],
  tierBreakdown: [
    { tierIndex: 0, itemCount: 1, colorSpec: { kind: 'palette', index: 0 } },
  ],
  pinned: false,
}

describe('getLibraryBoardAriaLabel', () =>
{
  it('includes title, counts, visibility, publish state, and sync state', () =>
  {
    expect(getLibraryBoardAriaLabel(board)).toBe(
      'Summer rankings, 2 items, 6 tiers, Private, WIP, Local only'
    )
  })
})
