// tests/interaction/selectionState.test.ts
// shared radio/tab selection semantics

import { describe, expect, it } from 'vitest'

import {
  resolveRovingTabIndex,
  resolveSelectionActiveKey,
} from '~/shared/selection/selectionState'
import { asInvalid } from '@tests/typeHelpers'

describe('resolveSelectionActiveKey & resolveRovingTabIndex', () =>
{
  it('keeps active key if present, falls back to first, & only active item is tabbable', () =>
  {
    expect(resolveSelectionActiveKey(['a', 'b', 'c'], 'b')).toBe('b')
    expect(
      resolveSelectionActiveKey(
        ['a', 'b', 'c'],
        asInvalid<'a' | 'b' | 'c'>('z')
      )
    ).toBe('a')
    expect(resolveSelectionActiveKey([], asInvalid<never>('z'))).toBeNull()

    expect(resolveRovingTabIndex('b', 'b')).toBe(0)
    expect(resolveRovingTabIndex('a', 'b')).toBe(-1)
    expect(resolveRovingTabIndex('a', null)).toBe(-1)
  })
})
