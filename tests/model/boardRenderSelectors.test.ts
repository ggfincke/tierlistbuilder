// tests/model/boardRenderSelectors.test.ts
// active-board selectors used to isolate hot React render paths

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asItemId, asTierId } from '@tierlistbuilder/contracts/lib/ids'

import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { createFreshRuntimeState } from '~/features/workspace/boards/model/runtime'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  createSelectBoardItemById,
  filterItemIdsByLabel,
  selectActiveItemCount,
} from '~/features/workspace/boards/model/slices/selectors'
import { makeItem, makeTier } from '../fixtures'

const ITEM_ALPHA = asItemId('item-alpha')
const ITEM_BETA = asItemId('item-beta')
const ITEM_GAMMA = asItemId('item-gamma')
const TIER_ALPHA = asTierId('tier-alpha')

const seedActiveBoard = (): void =>
{
  useActiveBoardStore.setState({
    ...createInitialBoardData('classic'),
    ...EMPTY_BOARD_SYNC_STATE,
    ...createFreshRuntimeState(),
    tiers: [
      makeTier({
        id: TIER_ALPHA,
        name: 'Alpha',
        itemIds: [ITEM_ALPHA],
      }),
    ],
    unrankedItemIds: [ITEM_BETA, ITEM_GAMMA],
    items: {
      [ITEM_ALPHA]: makeItem({ id: ITEM_ALPHA, label: 'Alpha' }),
      [ITEM_BETA]: makeItem({ id: ITEM_BETA, label: 'Beta' }),
      [ITEM_GAMMA]: makeItem({ id: ITEM_GAMMA, label: 'Gamma' }),
    },
  })
}

describe('active-board render selectors', () =>
{
  beforeEach(() =>
  {
    seedActiveBoard()
  })

  it('keeps item-count subscribers quiet when item metadata changes', () =>
  {
    const listener = vi.fn()
    const unsubscribe = useActiveBoardStore.subscribe(
      selectActiveItemCount,
      listener
    )

    try
    {
      useActiveBoardStore.getState().setItemLabel(ITEM_ALPHA, 'Alpha Prime')
      expect(listener).not.toHaveBeenCalled()

      useActiveBoardStore.getState().removeItem(ITEM_BETA)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenLastCalledWith(2, 3)
    }
    finally
    {
      unsubscribe()
    }
  })

  it('keeps item-by-id subscribers quiet when another item changes', () =>
  {
    const listener = vi.fn()
    const unsubscribe = useActiveBoardStore.subscribe(
      createSelectBoardItemById(ITEM_ALPHA),
      listener
    )

    try
    {
      useActiveBoardStore.getState().setItemLabel(ITEM_BETA, 'Beta Prime')
      expect(listener).not.toHaveBeenCalled()

      useActiveBoardStore.getState().setItemLabel(ITEM_ALPHA, 'Alpha Prime')
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ label: 'Alpha Prime' }),
        expect.objectContaining({ label: 'Alpha' })
      )
    }
    finally
    {
      unsubscribe()
    }
  })

  it('filters unranked IDs by label for the search-only subscription path', () =>
  {
    const state = useActiveBoardStore.getState()

    expect(
      filterItemIdsByLabel(state.items, state.unrankedItemIds, 'MA')
    ).toEqual([ITEM_GAMMA])
    expect(
      filterItemIdsByLabel(state.items, state.unrankedItemIds, 'missing')
    ).toEqual([])
  })
})
