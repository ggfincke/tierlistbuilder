// src/app/shells/topNav/NewBoardMenu.tsx
// "+ New board" dropdown menu

import { FilePlus2 } from 'lucide-react'

import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

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
    </ul>
  </OverlayMenuSurface>
)
