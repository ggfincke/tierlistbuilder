// tests/overlay/toolbarPosition.test.ts
// toolbar layout & menu submenu flip helpers

import { describe, expect, it } from 'vitest'
import {
  resolveMenuOverflowFlipTokens,
  MENU_SUBMENU_FLIP_LEFT_TOKENS,
  MENU_SUBMENU_FLIP_RIGHT_TOKENS,
  MENU_SUBMENU_LEFT_OFFSET_CLASS,
  MENU_SUBMENU_RIGHT_OFFSET_CLASS,
} from '~/shared/overlay/menuOverflow'
import {
  getMenuPositionClasses,
  getResponsiveToolbarPosition,
} from '~/shared/overlay/toolbarPosition'

describe('menu submenu placement & overflow flipping', () =>
{
  it('opens submenus toward the open side & flips on viewport overflow', () =>
  {
    expect(getMenuPositionClasses('top').sub).toContain(
      MENU_SUBMENU_RIGHT_OFFSET_CLASS
    )
    expect(getMenuPositionClasses('right').sub).toContain(
      MENU_SUBMENU_LEFT_OFFSET_CLASS
    )

    expect(
      resolveMenuOverflowFlipTokens({ left: 950, right: 1220 }, 1200)
    ).toEqual(MENU_SUBMENU_FLIP_LEFT_TOKENS)
    expect(
      resolveMenuOverflowFlipTokens({ left: -4, right: 180 }, 1200)
    ).toEqual(MENU_SUBMENU_FLIP_RIGHT_TOKENS)
    expect(
      resolveMenuOverflowFlipTokens({ left: 120, right: 320 }, 1200)
    ).toEqual([])
  })
})

describe('getResponsiveToolbarPosition', () =>
{
  it('collapses side toolbars to top below sm breakpoint, otherwise passes through', () =>
  {
    expect(getResponsiveToolbarPosition('left', false)).toBe('top')
    expect(getResponsiveToolbarPosition('right', false)).toBe('top')
    expect(getResponsiveToolbarPosition('right', true)).toBe('right')
    expect(getResponsiveToolbarPosition('bottom', true)).toBe('bottom')
  })
})
