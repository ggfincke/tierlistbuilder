// tests/model/publishBoardSelection.test.ts
// guards publish-modal source-board selection against silent fallbacks

import { describe, expect, it } from 'vitest'

import {
  createInitialPublishBoardSelection,
  resolveSelectedPublishBoard,
} from '~/features/marketplace/components/publishBoardSelection'
import type { PublishableBoard } from '~/features/workspace/boards/model/usePublishableBoards'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

const makeBoard = (
  boardExternalId: BoardId,
  createdAt: number
): PublishableBoard => ({
  boardId: boardExternalId,
  boardExternalId,
  title: boardExternalId,
  itemCount: 1,
  createdAt,
})

describe('publish board selection', () =>
{
  it('defaults only when the caller did not pin a source board', () =>
  {
    const recent = makeBoard('board-recent', 200)
    const older = makeBoard('board-older', 100)
    const boards = [recent, older]

    expect(
      resolveSelectedPublishBoard(
        boards,
        createInitialPublishBoardSelection({ isEdit: false })
      )
    ).toBe(recent)
    expect(
      resolveSelectedPublishBoard(
        boards,
        createInitialPublishBoardSelection({
          isEdit: false,
          initialBoardExternalId: older.boardExternalId,
        })
      )
    ).toBe(older)
    expect(
      resolveSelectedPublishBoard(
        boards,
        createInitialPublishBoardSelection({
          isEdit: false,
          initialBoardExternalId: 'board-empty',
        })
      )
    ).toBeNull()
    expect(
      createInitialPublishBoardSelection({
        isEdit: true,
        initialBoardExternalId: recent.boardExternalId,
      })
    ).toEqual({ kind: 'default' })
  })
})
