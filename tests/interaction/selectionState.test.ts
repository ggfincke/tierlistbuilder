// tests/interaction/selectionState.test.ts
// shared radio/tab selection semantics

import { describe, expect, it } from 'vitest'

import {
  getSelectionGroupProps,
  getSelectionItemState,
  resolveRovingTabIndex,
  resolveSelectionActiveKey,
} from '~/shared/selection/selectionState'
import { asInvalid } from '../typeHelpers'

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

describe('selection ARIA props', () =>
{
  it('builds radiogroup/tablist semantics & per-item radio/tab roles', () =>
  {
    expect(getSelectionGroupProps({ kind: 'radio', label: 'Theme' })).toEqual({
      role: 'radiogroup',
      'aria-label': 'Theme',
      'aria-labelledby': undefined,
      'aria-orientation': 'horizontal',
    })
    expect(
      getSelectionGroupProps({
        kind: 'radio',
        labelledby: 'picker-title',
        isGrid: true,
      })
    ).toMatchObject({ 'aria-orientation': undefined })
    expect(
      getSelectionGroupProps({ kind: 'tab', label: 'Settings sections' })
    ).toMatchObject({ role: 'tablist' })

    expect(getSelectionItemState('radio', true)).toEqual({
      role: 'radio',
      'aria-checked': true,
    })
    expect(getSelectionItemState('tab', false)).toEqual({
      role: 'tab',
      'aria-selected': false,
    })
  })
})
