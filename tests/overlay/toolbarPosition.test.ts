// tests/overlay/toolbarPosition.test.ts
// toolbar-aware layout helpers

import { describe, expect, it } from 'vitest'
import { resolveMenuOverflowFlipTokens } from '~/shared/overlay/useMenuOverflowFlip'
import {
  MENU_SUBMENU_FLIP_LEFT_TOKENS,
  MENU_SUBMENU_FLIP_RIGHT_TOKENS,
  MENU_SUBMENU_LEFT_OFFSET_CLASS,
  MENU_SUBMENU_RIGHT_OFFSET_CLASS,
} from '~/shared/overlay/menuClasses'
import {
  getMenuPositionClasses,
  getResponsiveToolbarPosition,
} from '~/shared/layout/toolbarPosition'

describe('getMenuPositionClasses', () =>
{
  it('opens top-mounted submenus to the right by default', () =>
  {
    expect(getMenuPositionClasses('top').sub).toContain(
      MENU_SUBMENU_RIGHT_OFFSET_CLASS
    )
  })

  it('opens right-mounted submenus to the left by default', () =>
  {
    expect(getMenuPositionClasses('right').sub).toContain(
      MENU_SUBMENU_LEFT_OFFSET_CLASS
    )
  })
})

describe('resolveMenuOverflowFlipTokens', () =>
{
  it('flips a submenu left when it overflows the right edge', () =>
  {
    expect(
      resolveMenuOverflowFlipTokens(
        {
          left: 950,
          right: 1220,
        },
        1200
      )
    ).toEqual(MENU_SUBMENU_FLIP_LEFT_TOKENS)
  })

  it('flips a submenu right when it overflows the left edge', () =>
  {
    expect(
      resolveMenuOverflowFlipTokens(
        {
          left: -4,
          right: 180,
        },
        1200
      )
    ).toEqual(MENU_SUBMENU_FLIP_RIGHT_TOKENS)
  })

  it('leaves the submenu untouched when it fits in the viewport', () =>
  {
    expect(
      resolveMenuOverflowFlipTokens(
        {
          left: 120,
          right: 320,
        },
        1200
      )
    ).toEqual([])
  })
})

describe('getResponsiveToolbarPosition', () =>
{
  it('collapses side toolbars to top below the sm breakpoint', () =>
  {
    expect(getResponsiveToolbarPosition('left', false)).toBe('top')
    expect(getResponsiveToolbarPosition('right', false)).toBe('top')
  })

  it('preserves the configured position above the breakpoint', () =>
  {
    expect(getResponsiveToolbarPosition('right', true)).toBe('right')
    expect(getResponsiveToolbarPosition('bottom', true)).toBe('bottom')
  })
})
