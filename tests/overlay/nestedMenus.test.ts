// tests/overlay/nestedMenus.test.ts
// nested menu state helpers

import { describe, expect, it } from 'vitest'
import {
  buildNestedMenuIndex,
  closeNestedMenuBranch,
  pruneNestedMenuState,
  toggleNestedMenuState,
  type NestedMenuDefinition,
} from '~/shared/overlay/useNestedMenus'

type MenuId = 'root' | 'image' | 'format' | 'exportAll'

const MENU_DEFINITIONS: readonly NestedMenuDefinition<MenuId>[] = [
  { id: 'root' },
  { id: 'image', parentId: 'root' },
  { id: 'format', parentId: 'image' },
  { id: 'exportAll', parentId: 'root' },
]

const MENU_INDEX = buildNestedMenuIndex(MENU_DEFINITIONS)

describe('toggleNestedMenuState', () =>
{
  it('opens the full ancestor path for a submenu', () =>
  {
    expect(toggleNestedMenuState([], MENU_INDEX, 'image', new Set())).toEqual([
      'root',
      'image',
    ])
  })

  it('opens a nested child without collapsing its ancestors', () =>
  {
    expect(
      toggleNestedMenuState(['root', 'image'], MENU_INDEX, 'format', new Set())
    ).toEqual(['root', 'image', 'format'])
  })

  it('closes sibling branches when another submenu opens', () =>
  {
    expect(
      toggleNestedMenuState(
        ['root', 'image', 'format'],
        MENU_INDEX,
        'exportAll',
        new Set()
      )
    ).toEqual(['root', 'exportAll'])
  })

  it('closes a submenu branch when toggled while already open', () =>
  {
    expect(
      toggleNestedMenuState(
        ['root', 'image', 'format'],
        MENU_INDEX,
        'image',
        new Set()
      )
    ).toEqual(['root'])
  })

  it('ignores toggles for disabled branches', () =>
  {
    expect(
      toggleNestedMenuState(
        ['root', 'image'],
        MENU_INDEX,
        'exportAll',
        new Set<MenuId>(['root'])
      )
    ).toEqual([])
  })
})

describe('closeNestedMenuBranch', () =>
{
  it('removes the target menu & all descendants', () =>
  {
    expect(
      closeNestedMenuBranch(
        ['root', 'image', 'format', 'exportAll'],
        MENU_INDEX,
        'image'
      )
    ).toEqual(['root', 'exportAll'])
  })
})

describe('pruneNestedMenuState', () =>
{
  it('removes disabled sibling branches without touching active branches', () =>
  {
    expect(
      pruneNestedMenuState(
        ['root', 'image', 'format', 'exportAll'],
        MENU_INDEX,
        new Set<MenuId>(['exportAll'])
      )
    ).toEqual(['root', 'image', 'format'])
  })

  it('removes an entire tree when the root menu becomes disabled', () =>
  {
    expect(
      pruneNestedMenuState(
        ['root', 'image', 'format'],
        MENU_INDEX,
        new Set<MenuId>(['root'])
      )
    ).toEqual([])
  })
})
