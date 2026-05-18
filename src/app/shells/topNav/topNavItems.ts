// src/app/shells/topNav/topNavItems.ts
// route pill defs for the top nav

import { Bookmark, Layers, type LucideIcon } from 'lucide-react'

import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'

export interface TopNavItem
{
  id: 'workspace' | 'boards'
  label: string
  to: string
  icon: LucideIcon
  end: boolean
}

export const TOP_NAV_ITEMS: readonly TopNavItem[] = [
  { id: 'workspace', label: 'Workspace', to: '/', icon: Layers, end: true },
  {
    id: 'boards',
    label: 'My Boards',
    to: BOARDS_ROUTE_PATH,
    icon: Bookmark,
    end: false,
  },
]
