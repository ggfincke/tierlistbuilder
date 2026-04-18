// tests/keyboardTabStop.test.ts
// tab-stop selector fallback cache — verifies O(1) cache hits when the
// tiers & unranked refs are unchanged

import { describe, expect, it } from 'vitest'

import { selectKeyboardTabStopItemId } from '~/features/workspace/boards/model/slices/selectors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeTier } from '../fixtures'

const ids = (...values: string[]) => values.map(asItemId)

describe('selectKeyboardTabStopItemId', () =>
{
  it('returns focus item ID when set', () =>
  {
    const state = {
      keyboardFocusItemId: asItemId('focus-me'),
      tiers: [makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a', 'b') })],
      unrankedItemIds: [],
    }
    expect(selectKeyboardTabStopItemId(state)).toBe('focus-me')
  })

  it('falls back to first tier item when focus is null', () =>
  {
    const state = {
      keyboardFocusItemId: null,
      tiers: [
        makeTier({ id: 'tier-s', name: 'S', itemIds: ids('first') }),
        makeTier({ id: 'tier-a', name: 'A', itemIds: ids('second') }),
      ],
      unrankedItemIds: [],
    }
    expect(selectKeyboardTabStopItemId(state)).toBe('first')
  })

  it('falls back to unranked when no tiers have items', () =>
  {
    const state = {
      keyboardFocusItemId: null,
      tiers: [makeTier({ id: 'tier-s', name: 'S' })],
      unrankedItemIds: ids('u1'),
    }
    expect(selectKeyboardTabStopItemId(state)).toBe('u1')
  })

  it('returns null when no items exist anywhere', () =>
  {
    const state = {
      keyboardFocusItemId: null,
      tiers: [makeTier({ id: 'tier-s', name: 'S' })],
      unrankedItemIds: [],
    }
    expect(selectKeyboardTabStopItemId(state)).toBeNull()
  })

  it('caches fallback when tiers & unranked are ref-stable', () =>
  {
    const tiers = [
      makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a', 'b') }),
    ]
    const unrankedItemIds = ids('u1')

    const state = { keyboardFocusItemId: null, tiers, unrankedItemIds }

    const first = selectKeyboardTabStopItemId(state)
    const second = selectKeyboardTabStopItemId(state)
    const third = selectKeyboardTabStopItemId(state)

    expect(first).toBe('a')
    expect(second).toBe('a')
    expect(third).toBe('a')
    expect(first).toBe(second)
  })

  it('invalidates cache when tiers reference changes', () =>
  {
    const tiers1 = [makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a') })]
    const tiers2 = [makeTier({ id: 'tier-s', name: 'S', itemIds: ids('b') })]

    const first = selectKeyboardTabStopItemId({
      keyboardFocusItemId: null,
      tiers: tiers1,
      unrankedItemIds: [],
    })
    const second = selectKeyboardTabStopItemId({
      keyboardFocusItemId: null,
      tiers: tiers2,
      unrankedItemIds: [],
    })

    expect(first).toBe('a')
    expect(second).toBe('b')
  })

  it('invalidates cache when unranked reference changes', () =>
  {
    const tiers = [makeTier({ id: 'tier-s', name: 'S' })]
    const unranked1 = ids('u1')
    const unranked2 = ids('u2')

    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers,
        unrankedItemIds: unranked1,
      })
    ).toBe('u1')
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers,
        unrankedItemIds: unranked2,
      })
    ).toBe('u2')
  })
})
