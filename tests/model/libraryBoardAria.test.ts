// tests/model/libraryBoardAria.test.ts
// My Boards accessible-name helpers

import { describe, expect, it } from 'vitest'

import { getLibraryBoardAriaLabel } from '~/features/library/lib/libraryBoardAria'
import { makeLibraryBoardListItem } from '../fixtures'

const board = makeLibraryBoardListItem({
  title: 'Summer rankings',
  activeItemCount: 2,
  unrankedItemCount: 1,
  // tierCount is the untruncated total; tierColors stays capped at
  // LIBRARY_BOARD_TIER_LIMIT, so the two diverge for >5-tier boards
  tierCount: 6,
})

describe('getLibraryBoardAriaLabel', () =>
{
  it('includes title, counts, visibility, publish state, and sync state', () =>
  {
    expect(getLibraryBoardAriaLabel(board)).toBe(
      'Summer rankings, 2 items, 6 tiers, Private, WIP, Local only'
    )
  })
})
