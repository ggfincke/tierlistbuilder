// src/shared/overlay/menuClasses.ts
// shared submenu offset & bridge class tokens for overlay menus

export const MENU_SUBMENU_RIGHT_OFFSET_CLASS = 'left-[calc(100%+0.375rem)]'
export const MENU_SUBMENU_LEFT_OFFSET_CLASS = 'right-[calc(100%+0.375rem)]'
export const MENU_SUBMENU_BRIDGE_TO_RIGHT_EDGE_CLASS = 'before:-left-2'
export const MENU_SUBMENU_BRIDGE_TO_LEFT_EDGE_CLASS = 'before:-right-2'
export const MENU_SUBMENU_BRIDGE_COMMON_TOKENS = [
  'before:top-0',
  'before:h-full',
  'before:w-2',
] as const

export const MENU_SUBMENU_FLIP_LEFT_TOKENS = [
  MENU_SUBMENU_LEFT_OFFSET_CLASS,
  'left-auto',
  MENU_SUBMENU_BRIDGE_TO_LEFT_EDGE_CLASS,
  'before:left-auto',
  ...MENU_SUBMENU_BRIDGE_COMMON_TOKENS,
] as const

export const MENU_SUBMENU_FLIP_RIGHT_TOKENS = [
  MENU_SUBMENU_RIGHT_OFFSET_CLASS,
  'right-auto',
  MENU_SUBMENU_BRIDGE_TO_RIGHT_EDGE_CLASS,
  'before:right-auto',
  ...MENU_SUBMENU_BRIDGE_COMMON_TOKENS,
] as const
