// src/app/shells/topNav/TopNavAccountMenu.tsx
// avatar dropdown menu

import { Settings } from 'lucide-react'

import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

interface TopNavAccountMenuProps
{
  onClose: () => void
  menuId: string
  onOpenPreferences: () => void
}

export const TopNavAccountMenu = ({
  onClose,
  menuId,
  onOpenPreferences,
}: TopNavAccountMenuProps) => (
  <OverlayMenuSurface
    id={menuId}
    role="menu"
    aria-label="Account menu"
    className="absolute right-0 top-[calc(100%+8px)] w-60 origin-top-right overflow-hidden p-0"
  >
    <ul role="none" className="flex flex-col px-1.5 py-2">
      <li role="none">
        <OverlayMenuItem
          role="menuitem"
          density="compact"
          onClick={() =>
          {
            onOpenPreferences()
            onClose()
          }}
        >
          <Settings className="h-3.5 w-3.5" strokeWidth={1.8} />
          Preferences
        </OverlayMenuItem>
      </li>
    </ul>
  </OverlayMenuSurface>
)
