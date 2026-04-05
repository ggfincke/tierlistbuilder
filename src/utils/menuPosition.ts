// src/utils/menuPosition.ts
// toolbar-position-aware CSS classes for popup menus

import type { ToolbarPosition } from '../types'

export interface MenuPositionClasses
{
  // primary dropdown menu anchored to the trigger button
  primary: string
  // nested submenu anchored to a parent menu item
  sub: string
  // invisible bridge hit-area between trigger & primary menu
  bridge: string
  // invisible bridge hit-area between parent menu & submenu
  subBridge: string
  // chevron indicator direction for submenu triggers
  chevronClass: string
  // position-aware menu animation class
  animationClass: string
}

// pre-computed class sets — avoids object allocation on every render
const MENU_POSITION_CLASSES: Record<ToolbarPosition, MenuPositionClasses> = {
  top: {
    primary: 'absolute left-1/2 top-full z-30 mt-3 w-max -translate-x-1/2',
    sub: 'absolute left-[calc(100%+0.375rem)] top-[-0.375rem] z-40 w-max',
    bridge:
      'before:absolute before:-top-3 before:left-0 before:h-3 before:w-full',
    subBridge:
      'before:absolute before:-left-2 before:top-0 before:h-full before:w-2',
    chevronClass: '',
    animationClass: 'animate-[menuInDown_120ms_ease-out]',
  },
  bottom: {
    primary: 'absolute left-1/2 bottom-full z-30 mb-3 w-max -translate-x-1/2',
    sub: 'absolute left-[calc(100%+0.375rem)] bottom-[-0.375rem] z-40 w-max',
    bridge:
      'before:absolute before:-bottom-3 before:left-0 before:h-3 before:w-full',
    subBridge:
      'before:absolute before:-left-2 before:top-0 before:h-full before:w-2',
    chevronClass: '',
    animationClass: 'animate-[menuInUp_120ms_ease-out]',
  },
  left: {
    primary: 'absolute left-full top-1/2 z-30 ml-3 w-max -translate-y-1/2',
    sub: 'absolute left-[calc(100%+0.375rem)] top-[-0.375rem] z-40 w-max',
    bridge:
      'before:absolute before:-left-3 before:top-0 before:h-full before:w-3',
    subBridge:
      'before:absolute before:-left-2 before:top-0 before:h-full before:w-2',
    chevronClass: '',
    animationClass: 'animate-[menuInRight_120ms_ease-out]',
  },
  right: {
    primary: 'absolute right-full top-1/2 z-30 mr-3 w-max -translate-y-1/2',
    sub: 'absolute right-[calc(100%+0.375rem)] top-[-0.375rem] z-40 w-max',
    bridge:
      'before:absolute before:-right-3 before:top-0 before:h-full before:w-3',
    subBridge:
      'before:absolute before:-right-2 before:top-0 before:h-full before:w-2',
    chevronClass: 'rotate-180',
    animationClass: 'animate-[menuInLeft_120ms_ease-out]',
  },
}

// toolbar position cycle order for keyboard shortcut
const POSITION_CYCLE: ToolbarPosition[] = ['top', 'right', 'bottom', 'left']

// returns whether the toolbar position places it on the side (vertical layout)
export const isVerticalPosition = (position: ToolbarPosition): boolean =>
  position === 'left' || position === 'right'

// returns CSS class sets that open menus away from the toolbar edge
export const getMenuPositionClasses = (
  position: ToolbarPosition
): MenuPositionClasses => MENU_POSITION_CLASSES[position]

// returns the next toolbar position in the cycle
export const nextToolbarPosition = (
  current: ToolbarPosition
): ToolbarPosition =>
{
  const idx = POSITION_CYCLE.indexOf(current)
  return POSITION_CYCLE[(idx + 1) % POSITION_CYCLE.length]
}

// returns the effective toolbar position, collapsing side positions on small screens
export const getResponsiveToolbarPosition = (
  position: ToolbarPosition,
  aboveSmBreakpoint: boolean
): ToolbarPosition =>
{
  // collapse side toolbar to top on viewports below Tailwind sm (640px)
  if (!aboveSmBreakpoint && isVerticalPosition(position)) return 'top'
  return position
}
