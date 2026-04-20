// src/shared/theme/zIndex.ts
// shared z-index ladder — one rung per semantic tier, kept small on purpose.
// tailwind `z-<n>` classes elsewhere in the codebase map 1:1 to these values

export const Z = {
  // default stacking context (used for `zIndex: -1` offscreen export hosts via Z.offscreen)
  offscreen: -1,
  base: 0,
  // item focus rings, inline canvas text input, drag-raised items
  dropdown: 10,
  // selected/active item elevation
  popup: 20,
  // primary submenu layer for toolbar popups
  submenu: 30,
  // floating panels (board manager trigger, bulk action bar, nested submenu bridge)
  overlay: 40,
  // modals, toasts, modal-layer menus
  modal: 50,
} as const

export type ZTier = keyof typeof Z
