// tests/library/localBoardsLibrary.test.ts
// local board library projection resilience

import { describe, expect, it } from 'vitest'

import { asItemId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import {
  boardStorageKey,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { projectLocalRow } from '~/features/library/model/useLocalBoardsLibrary'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'

const TEST_BOARD_ID = 'board-library-projection-test' as BoardId

const meta = {
  id: TEST_BOARD_ID,
  title: 'Library board',
  createdAt: 123,
}

describe('projectLocalRow', () =>
{
  it('normalizes malformed tier entries instead of crashing', () =>
  {
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        version: BOARD_DATA_VERSION,
        data: {
          title: 'Malformed board',
          tiers: [
            {
              id: 'tier-s',
              name: 'S',
              colorSpec: { kind: 'palette', index: 0 },
            },
          ],
          items: {
            item_1: { id: 'item_1', label: 'One' },
          },
          unrankedItemIds: [],
          deletedItems: [],
          paletteId: 'classic',
        },
      })
    )

    const row = projectLocalRow(meta)

    expect(row.activeItemCount).toBe(0)
    expect(row.rankedItemCount).toBe(0)
    expect(row.tierBreakdown).toEqual([
      {
        tierIndex: 0,
        itemCount: 0,
        colorSpec: { kind: 'palette', index: 0 },
      },
    ])
  })

  it('still projects corrupted envelopes as zeroed rows', () =>
  {
    localStorage.setItem(boardStorageKey(TEST_BOARD_ID), '{broken')

    const row = projectLocalRow(meta)

    expect(row.activeItemCount).toBe(0)
    expect(row.rankedItemCount).toBe(0)
    expect(row.unrankedItemCount).toBe(0)
    expect(row.tierBreakdown).toEqual([])
  })

  it('preserves valid local counts after normalization', () =>
  {
    saveBoardToStorage(TEST_BOARD_ID, {
      ...createInitialBoardData('classic'),
      items: {
        [asItemId('item_1')]: { id: asItemId('item_1'), label: 'One' },
        [asItemId('item_2')]: { id: asItemId('item_2'), label: 'Two' },
      },
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          itemIds: [asItemId('item_1')],
        },
      ],
      unrankedItemIds: [asItemId('item_2')],
    })

    const row = projectLocalRow(meta)

    expect(row.activeItemCount).toBe(2)
    expect(row.rankedItemCount).toBe(1)
    expect(row.unrankedItemCount).toBe(1)
  })
})
