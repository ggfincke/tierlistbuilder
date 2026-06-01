// src/app/shells/top-nav/NewBoardMenu.tsx
// two-option new-board dropdown for blank boards & marketplace templates

import { FilePlus2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { overlayMenuItemClass } from '~/shared/overlay/menuItemClass'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

interface NewBoardMenuProps
{
  onClose: () => void
  onStartBlank: () => void
  menuId: string
}

export const NewBoardMenu = ({
  onClose,
  onStartBlank,
  menuId,
}: NewBoardMenuProps) => (
  <OverlayMenuSurface
    id={menuId}
    role="menu"
    aria-label="New board options"
    className="absolute left-0 top-[calc(100%+8px)] w-64 origin-top-left overflow-hidden p-0"
  >
    <ul role="none" className="flex flex-col px-1.5 py-2">
      <li role="none">
        <OverlayMenuItem
          role="menuitem"
          density="compact"
          onClick={() =>
          {
            onStartBlank()
            onClose()
          }}
        >
          <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          Start blank
        </OverlayMenuItem>
      </li>
      <li role="none">
        <Link
          role="menuitem"
          to={TEMPLATES_ROUTE_PATH}
          onClick={onClose}
          className={overlayMenuItemClass('compact')}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          From a community template
        </Link>
      </li>
    </ul>
  </OverlayMenuSurface>
)
