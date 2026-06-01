// tests/board/publishableBoards.test.ts
// publishable-board projection should stay aligned w/ local storage edits.

import { afterEach, describe, expect, it } from 'vitest'

import type {
  BoardId,
  ItemId,
  TierId,
} from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardMeta,
  BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import {
  __resetPublishableBoardsCacheForTests,
  projectPublishableBoards,
} from '~/features/workspace/boards/model/usePublishableBoards'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'

const boardId = 'board-publishable-test' as BoardId
const tierId = 'tier-publishable' as TierId
const firstItemId = 'item-publishable-a' as ItemId
const secondItemId = 'item-publishable-b' as ItemId

const meta: BoardMeta = {
  id: boardId,
  title: 'Registry title',
  createdAt: 123,
}

const makeSnapshot = (
  title: string,
  itemIds: readonly ItemId[]
): BoardSnapshot =>
  makeBoardSnapshot({
    title,
    tiers: [makeTier({ id: tierId, itemIds: [] })],
    items: Object.fromEntries(
      itemIds.map((id, index) => [
        id,
        makeItem({ id, label: `Item ${index + 1}` }),
      ])
    ) as BoardSnapshot['items'],
    unrankedItemIds: [...itemIds],
  })

describe('publishable board projection', () =>
{
  afterEach(() =>
  {
    localStorage.clear()
    __resetPublishableBoardsCacheForTests()
  })

  it('re-reads storage when stable registry metadata points at an edited board', () =>
  {
    expect(
      saveBoardToStorage(boardId, makeSnapshot('Original', [firstItemId])).ok
    ).toBe(true)
    expect(projectPublishableBoards([meta]).boards[0]).toMatchObject({
      boardId,
      title: 'Original',
      itemCount: 1,
    })

    expect(
      saveBoardToStorage(
        boardId,
        makeSnapshot('Edited', [firstItemId, secondItemId])
      ).ok
    ).toBe(true)

    expect(projectPublishableBoards([meta]).boards[0]).toMatchObject({
      boardId,
      title: 'Edited',
      itemCount: 2,
    })
  })

  it('surfaces empty boards as unavailable without returning stale rows', () =>
  {
    expect(
      saveBoardToStorage(boardId, makeSnapshot('Original', [firstItemId])).ok
    ).toBe(true)
    expect(projectPublishableBoards([meta]).boards).toHaveLength(1)

    expect(saveBoardToStorage(boardId, makeSnapshot('Empty', [])).ok).toBe(true)

    expect(projectPublishableBoards([meta])).toEqual({
      boards: [],
      hasEmptyBoards: true,
    })
  })
})
