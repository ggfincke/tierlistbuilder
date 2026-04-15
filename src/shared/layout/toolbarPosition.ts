// src/shared/layout/toolbarPosition.ts
// toolbar-position math & position-aware menu class presets

import type { ToolbarPosition } from '@tierlistbuilder/contracts/workspace/settings'
import {
  MENU_SUBMENU_BRIDGE_COMMON_TOKENS,
  MENU_SUBMENU_BRIDGE_TO_LEFT_EDGE_CLASS,
  MENU_SUBMENU_BRIDGE_TO_RIGHT_EDGE_CLASS,
  MENU_SUBMENU_LEFT_OFFSET_CLASS,
  MENU_SUBMENU_RIGHT_OFFSET_CLASS,
} from '@/shared/overlay/menuClasses'

export interface MenuPositionClasses
{
  primary: string
  sub: string
  bridge: string
  subBridge: string
  chevronClass: string
  animationClass: string
}

const MENU_SUBMENU_RIGHT_CLASS = `${MENU_SUBMENU_RIGHT_OFFSET_CLASS} top-[-0.375rem] z-40 w-max`
const MENU_SUBMENU_RIGHT_FROM_BOTTOM_CLASS = `${MENU_SUBMENU_RIGHT_OFFSET_CLASS} bottom-[-0.375rem] z-40 w-max`
const MENU_SUBMENU_LEFT_CLASS = `${MENU_SUBMENU_LEFT_OFFSET_CLASS} top-[-0.375rem] z-40 w-max`
const MENU_SUBMENU_BRIDGE_TO_RIGHT_CLASS = `${MENU_SUBMENU_BRIDGE_TO_RIGHT_EDGE_CLASS} ${MENU_SUBMENU_BRIDGE_COMMON_TOKENS.join(' ')}`
const MENU_SUBMENU_BRIDGE_TO_LEFT_CLASS = `${MENU_SUBMENU_BRIDGE_TO_LEFT_EDGE_CLASS} ${MENU_SUBMENU_BRIDGE_COMMON_TOKENS.join(' ')}`

const MENU_POSITION_CLASSES: Record<ToolbarPosition, MenuPositionClasses> = {
  top: {
    primary: 'absolute left-1/2 top-full z-30 mt-3 w-max -translate-x-1/2',
    sub: `absolute ${MENU_SUBMENU_RIGHT_CLASS}`,
    bridge:
      'before:absolute before:-top-3 before:left-0 before:h-3 before:w-full',
    subBridge: `before:absolute ${MENU_SUBMENU_BRIDGE_TO_RIGHT_CLASS}`,
    chevronClass: '',
    animationClass: 'animate-[menuInDown_120ms_ease-out]',
  },
  bottom: {
    primary: 'absolute left-1/2 bottom-full z-30 mb-3 w-max -translate-x-1/2',
    sub: `absolute ${MENU_SUBMENU_RIGHT_FROM_BOTTOM_CLASS}`,
    bridge:
      'before:absolute before:-bottom-3 before:left-0 before:h-3 before:w-full',
    subBridge: `before:absolute ${MENU_SUBMENU_BRIDGE_TO_RIGHT_CLASS}`,
    chevronClass: '',
    animationClass: 'animate-[menuInUp_120ms_ease-out]',
  },
  left: {
    primary: 'absolute left-full top-1/2 z-30 ml-3 w-max -translate-y-1/2',
    sub: `absolute ${MENU_SUBMENU_RIGHT_CLASS}`,
    bridge:
      'before:absolute before:-left-3 before:top-0 before:h-full before:w-3',
    subBridge: `before:absolute ${MENU_SUBMENU_BRIDGE_TO_RIGHT_CLASS}`,
    chevronClass: '',
    animationClass: 'animate-[menuInRight_120ms_ease-out]',
  },
  right: {
    primary: 'absolute right-full top-1/2 z-30 mr-3 w-max -translate-y-1/2',
    sub: `absolute ${MENU_SUBMENU_LEFT_CLASS}`,
    bridge:
      'before:absolute before:-right-3 before:top-0 before:h-full before:w-3',
    subBridge: `before:absolute ${MENU_SUBMENU_BRIDGE_TO_LEFT_CLASS}`,
    chevronClass: 'rotate-180',
    animationClass: 'animate-[menuInLeft_120ms_ease-out]',
  },
}

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
  const index = POSITION_CYCLE.indexOf(current)
  return POSITION_CYCLE[(index + 1) % POSITION_CYCLE.length]
}

// returns the effective toolbar position, collapsing side positions on small screens
export const getResponsiveToolbarPosition = (
  position: ToolbarPosition,
  aboveSmBreakpoint: boolean
): ToolbarPosition =>
{
  if (!aboveSmBreakpoint && isVerticalPosition(position))
  {
    return 'top'
  }

  return position
}
