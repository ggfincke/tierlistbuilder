// tests/overlay/nestedMenus.test.ts
// nested menu open/close & prune helpers

import { describe, expect, it } from 'vitest'
import {
  buildNestedMenuIndex,
  closeNestedMenuBranch,
  pruneNestedMenuState,
  toggleNestedMenuState,
  type NestedMenuDefinition,
} from '~/shared/overlay/nestedMenus'

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
  it('opens ancestors, closes siblings, toggles open submenus closed, & ignores disabled branches', () =>
  {
    expect(toggleNestedMenuState([], MENU_INDEX, 'image', new Set())).toEqual([
      'root',
      'image',
    ])
    expect(
      toggleNestedMenuState(['root', 'image'], MENU_INDEX, 'format', new Set())
    ).toEqual(['root', 'image', 'format'])
    expect(
      toggleNestedMenuState(
        ['root', 'image', 'format'],
        MENU_INDEX,
        'exportAll',
        new Set()
      )
    ).toEqual(['root', 'exportAll'])
    expect(
      toggleNestedMenuState(
        ['root', 'image', 'format'],
        MENU_INDEX,
        'image',
        new Set()
      )
    ).toEqual(['root'])
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

describe('closeNestedMenuBranch & pruneNestedMenuState', () =>
{
  it('removes target + descendants & prunes disabled branches', () =>
  {
    expect(
      closeNestedMenuBranch(
        ['root', 'image', 'format', 'exportAll'],
        MENU_INDEX,
        'image'
      )
    ).toEqual(['root', 'exportAll'])

    expect(
      pruneNestedMenuState(
        ['root', 'image', 'format', 'exportAll'],
        MENU_INDEX,
        new Set<MenuId>(['exportAll'])
      )
    ).toEqual(['root', 'image', 'format'])

    expect(
      pruneNestedMenuState(
        ['root', 'image', 'format'],
        MENU_INDEX,
        new Set<MenuId>(['root'])
      )
    ).toEqual([])
  })
})
