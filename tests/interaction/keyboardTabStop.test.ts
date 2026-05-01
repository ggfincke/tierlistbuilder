// tests/interaction/keyboardTabStop.test.ts
// roving tab-stop selector w/ ref-stable cache

import { describe, expect, it } from 'vitest'

import { selectKeyboardTabStopItemId } from '~/features/workspace/boards/model/slices/selectors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { brandItemIds as ids, makeTier } from '../fixtures'

describe('selectKeyboardTabStopItemId', () =>
{
  it('returns focus first; falls back to first tier item, then unranked, then null', () =>
  {
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: asItemId('focus-me'),
        tiers: [makeTier({ id: 'tier-s', itemIds: ids('a', 'b') })],
        unrankedItemIds: [],
      })
    ).toBe('focus-me')

    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: [
          makeTier({ id: 'tier-s', itemIds: ids('first') }),
          makeTier({ id: 'tier-a', itemIds: ids('second') }),
        ],
        unrankedItemIds: [],
      })
    ).toBe('first')

    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: [makeTier({ id: 'tier-s' })],
        unrankedItemIds: ids('u1'),
      })
    ).toBe('u1')

    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: [makeTier({ id: 'tier-s' })],
        unrankedItemIds: [],
      })
    ).toBeNull()
  })

  it('caches the fallback while refs are stable & invalidates on tier or unranked ref change', () =>
  {
    const tiers1 = [makeTier({ id: 'tier-s', itemIds: ids('a') })]
    const stable = {
      keyboardFocusItemId: null,
      tiers: tiers1,
      unrankedItemIds: ids('u1'),
    }
    expect(selectKeyboardTabStopItemId(stable)).toBe('a')
    expect(selectKeyboardTabStopItemId(stable)).toBe('a')

    const tiers2 = [makeTier({ id: 'tier-s', itemIds: ids('b') })]
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: tiers2,
        unrankedItemIds: [],
      })
    ).toBe('b')

    const tiersEmpty = [makeTier({ id: 'tier-s' })]
    const unranked2 = ids('u2')
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: tiersEmpty,
        unrankedItemIds: ids('u1'),
      })
    ).toBe('u1')
    expect(
      selectKeyboardTabStopItemId({
        keyboardFocusItemId: null,
        tiers: tiersEmpty,
        unrankedItemIds: unranked2,
      })
    ).toBe('u2')
  })
})
