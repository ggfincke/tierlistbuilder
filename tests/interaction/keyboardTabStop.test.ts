// tests/interaction/keyboardTabStop.test.ts
// tab-stop selector fallback cache — verifies O(1) cache hits when the
// tiers & unranked refs are unchanged

import { describe, expect, it } from 'vitest'

import { selectKeyboardTabStopItemId } from '~/features/workspace/boards/model/slices/selectors'
import { brandItemIds as ids, makeTier } from '@tests/fixtures'

describe('selectKeyboardTabStopItemId', () =>
{
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

  it('memoizes fallback by tiers+unranked refs (stable hits, invalidates on change)', () =>
  {
    const tiers = [
      makeTier({ id: 'tier-s', name: 'S', itemIds: ids('a', 'b') }),
    ]
    const unrankedItemIds = ids('u1')
    const state = { keyboardFocusItemId: null, tiers, unrankedItemIds }
    expect(selectKeyboardTabStopItemId(state)).toBe('a')
    expect(selectKeyboardTabStopItemId(state)).toBe('a')

    const tiers2 = [makeTier({ id: 'tier-s', name: 'S', itemIds: ids('b') })]
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: tiers2,
        unrankedItemIds: [],
      })
    ).toBe('b')

    const emptyTiers = [makeTier({ id: 'tier-s', name: 'S' })]
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: emptyTiers,
        unrankedItemIds: ids('u2'),
      })
    ).toBe('u2')
  })
})
