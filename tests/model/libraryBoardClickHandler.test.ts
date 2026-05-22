// tests/model/libraryBoardClickHandler.test.ts
// shared My Boards open-action binding

import { describe, expect, it, vi } from 'vitest'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { makeBoardClickHandler } from '~/features/library/lib/boardClickHandler'

const board: LibraryBoardListItem = {
  externalId: 'board-click-handler-test',
  title: 'Click handler test',
  createdAt: 1,
  updatedAt: 2,
  revision: 3,
  activeItemCount: 1,
  unrankedItemCount: 0,
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
  tierColors: [{ kind: 'palette', index: 0 }],
  tierBreakdown: [
    { tierIndex: 0, itemCount: 1, colorSpec: { kind: 'palette', index: 0 } },
  ],
  pinned: false,
}

describe('makeBoardClickHandler', () =>
{
  it('opens the board when the action is enabled', () =>
  {
    const onOpen = vi.fn()
    const action = makeBoardClickHandler(onOpen, false, board)

    action.onClick()

    expect(action.disabled).toBe(false)
    expect(onOpen).toHaveBeenCalledWith(board)
  })

  it('disables and guards the click when opening is pending or unavailable', () =>
  {
    const pendingOpen = vi.fn()
    const pendingAction = makeBoardClickHandler(pendingOpen, true, board)
    const missingAction = makeBoardClickHandler(undefined, false, board)

    pendingAction.onClick()
    missingAction.onClick()

    expect(pendingAction.disabled).toBe(true)
    expect(missingAction.disabled).toBe(true)
    expect(pendingOpen).not.toHaveBeenCalled()
  })
})
