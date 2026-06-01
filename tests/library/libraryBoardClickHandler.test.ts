// tests/library/libraryBoardClickHandler.test.ts
// shared My Boards open-action binding

import { describe, expect, it, vi } from 'vitest'

import { makeBoardClickHandler } from '~/features/library/lib/boardClickHandler'
import { makeLibraryBoardListItem } from '@tests/fixtures'

const board = makeLibraryBoardListItem({
  title: 'Click handler test',
})

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
