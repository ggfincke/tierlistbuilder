// src/app/shells/topNav/TopNavAccountMenu.tsx
// avatar dropdown menu for library & preferences

import { ListChecks, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { OverlayMenuSurface } from '~/shared/overlay/OverlaySurface'
import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'

interface TopNavAccountMenuProps
{
  onClose: () => void
  menuId: string
  onOpenPreferences: () => void
}

const MENU_ITEM_CLASS =
  'focus-custom flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] text-[var(--t-text-secondary)] transition hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

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
        <Link
          role="menuitem"
          to={BOARDS_ROUTE_PATH}
          onClick={onClose}
          className={MENU_ITEM_CLASS}
        >
          <ListChecks className="h-3.5 w-3.5" strokeWidth={1.8} />
          My lists
        </Link>
      </li>

      <li role="none">
        <button
          role="menuitem"
          type="button"
          onClick={() =>
          {
            onOpenPreferences()
            onClose()
          }}
          className={MENU_ITEM_CLASS}
        >
          <Settings className="h-3.5 w-3.5" strokeWidth={1.8} />
          Preferences
        </button>
      </li>
    </ul>
  </OverlayMenuSurface>
)
