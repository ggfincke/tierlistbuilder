import { describe, expect, it } from 'vitest'

import {
  getSelectionGroupProps,
  getSelectionItemState,
  resolveRovingTabIndex,
  resolveSelectionActiveKey,
} from '../src/utils/selectionState'

describe('resolveSelectionActiveKey', () =>
{
  it('keeps the provided key when it is still present', () =>
  {
    expect(resolveSelectionActiveKey(['a', 'b', 'c'], 'b')).toBe('b')
  })

  it('falls back to the first item when the active key drifts', () =>
  {
    expect(
      resolveSelectionActiveKey(['a', 'b', 'c'], 'z' as 'a' | 'b' | 'c')
    ).toBe('a')
  })

  it('returns null when the group is empty', () =>
  {
    expect(resolveSelectionActiveKey([], 'z' as never)).toBeNull()
  })
})

describe('resolveRovingTabIndex', () =>
{
  it('keeps only the active item tabbable', () =>
  {
    expect(resolveRovingTabIndex('b', 'b')).toBe(0)
    expect(resolveRovingTabIndex('a', 'b')).toBe(-1)
  })

  it('returns -1 when there is no active item', () =>
  {
    expect(resolveRovingTabIndex('a', null)).toBe(-1)
  })
})

describe('getSelectionGroupProps', () =>
{
  it('builds radio-group semantics for linear selectors', () =>
  {
    expect(
      getSelectionGroupProps({
        kind: 'radio',
        label: 'Theme',
      })
    ).toEqual({
      role: 'radiogroup',
      'aria-label': 'Theme',
      'aria-labelledby': undefined,
      'aria-orientation': 'horizontal',
    })
  })

  it('omits orientation for grid-based radio groups', () =>
  {
    expect(
      getSelectionGroupProps({
        kind: 'radio',
        labelledby: 'picker-title',
        isGrid: true,
      })
    ).toEqual({
      role: 'radiogroup',
      'aria-label': undefined,
      'aria-labelledby': 'picker-title',
      'aria-orientation': undefined,
    })
  })

  it('builds tab-list semantics for tab controls', () =>
  {
    expect(
      getSelectionGroupProps({
        kind: 'tab',
        label: 'Settings sections',
      })
    ).toEqual({
      role: 'tablist',
      'aria-label': 'Settings sections',
      'aria-labelledby': undefined,
      'aria-orientation': 'horizontal',
    })
  })
})

describe('getSelectionItemState', () =>
{
  it('builds radio-item semantics', () =>
  {
    expect(getSelectionItemState('radio', true)).toEqual({
      role: 'radio',
      'aria-checked': true,
    })
  })

  it('builds tab-item semantics', () =>
  {
    expect(getSelectionItemState('tab', false)).toEqual({
      role: 'tab',
      'aria-selected': false,
    })
  })
})
