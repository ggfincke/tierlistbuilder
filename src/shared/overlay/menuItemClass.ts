// src/shared/overlay/menuItemClass.ts
// shared class recipe for overlay menu rows. lives in its own module so the
// non-component export plays nicely w/ Fast Refresh in OverlaySurface.tsx

import { joinClassNames } from '~/shared/lib/className'

// default = roomy body menus (tier-row settings, board action bar).
// compact = top-nav-density rows w/ tighter padding & demoted text color
export type OverlayMenuItemDensity = 'default' | 'compact'

const MENU_ITEM_BASE =
  'focus-custom flex w-full items-center text-left transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

const MENU_ITEM_DENSITY: Record<OverlayMenuItemDensity, string> = {
  default:
    'gap-2 rounded-lg px-3 py-2 text-[var(--t-text)] hover:bg-[rgb(var(--t-overlay)/0.06)] focus-visible:bg-[rgb(var(--t-overlay)/0.08)] focus-visible:ring-inset',
  compact:
    'gap-2.5 rounded-md px-2.5 py-2 text-[12px] text-[var(--t-text-secondary)] hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)]',
}

// non-button rows (eg react-router <Link>) can't use the OverlayMenuItem
// component directly; this helper exposes the same recipe per call site
export const overlayMenuItemClass = (
  density: OverlayMenuItemDensity = 'default',
  extra?: string
): string => joinClassNames(MENU_ITEM_BASE, MENU_ITEM_DENSITY[density], extra)
